# PE-05B5 · Cómo se enciende el cobro automático el día que toque

El motor está construido y probado. Lo que sigue **no está encendido**, y este
documento existe para que encenderlo sea una decisión de tres pasos y no una
arqueología.

## La cadencia: cada hora

Y la verdad financiera **no depende de ella**. Se puede correr cada minuto o
cada seis horas y salen exactamente los mismos cobros, porque:

- el vencimiento sale del calendario comercial guardado, no del reloj del
  proceso;
- los cuatro huecos de reintento se miden desde el vencimiento, no desde la
  pasada anterior;
- una pasada repetida no cobra dos veces: lo impide el índice de un solo cobro
  en vuelo, el candado sobre la obligación y —como último cierre— que el
  proveedor rechaza repetir una referencia;
- una pasada que llega tarde consume **un** hueco y no encadena los que se
  perdió.

Una hora es el punto razonable: el retraso máximo normal en descubrir un
vencimiento es de una hora, y nadie lo nota. Más frecuente sería pagar
llamadas por nada.

## Por qué no hay un `cron` en el repositorio

Un `crons` en `vercel.json` se aplica a los despliegues de **Producción**. Meterlo
antes de que la pasarela esté habilitada allí significaría que el día que
Producción exista, el cobro automático arranca solo. Por eso el disparador es
un endpoint y no una configuración: encenderlo es un acto explícito.

Es la misma decisión que tomó QUALITY-11 con su barrido, y por la misma razón.

## Los tres pasos para encenderlo

**1 · Antes de nada, la puerta externa.** `WOMPI_GTW_PRODUCTION_ENABLEMENT_REQUIRED`
sigue abierto: Gateway activo, adquirencia, aceptación sin presencia de tarjeta,
recurrencia COF confirmada con las marcas, credenciales de producción, decisión
3DS/3RI y tarifas documentadas. Sin eso, lo demás no aplica.

**2 · Configurar la autorización de ejecución** en el entorno que vaya a cobrar:

```
BILLING_RENEWAL_RUNNER_SECRET        el acceso base
BILLING_RENEWAL_EXECUTE_SECRET       la autorización de cobrar, aparte
BILLING_RENEWAL_EXECUTION_ENABLED    true
BILLING_RENEWAL_EXECUTION_ALLOWLIST  vacío = nadie; en producción se retira
```

La lista blanca es un cierre de pruebas, no autoridad comercial: para producción
hay que decidir explícitamente si se retira o se convierte en otra cosa. **Hoy
está vacía y el interruptor apagado.**

**3 · Un disparador externo horario** que llame:

```
POST /api/billing/renewals/run
     x-billing-runner-secret:  <acceso>
     x-billing-execute-secret: <ejecución>
```

Sirve cualquiera —un programador de tareas, un servicio de cron gestionado, una
acción programada—. Lo que no sirve es exponer la ruta sin las dos cabeceras:
sin ellas responde 404 y sin el interruptor se queda en seco.

## Lo que hay que mirar la primera semana

En `/platform/plans`, sección **Renovaciones**: qué está por cobrarse, qué se
reintenta, qué se quedó sin tarjeta y —lo único que exige que mire una persona—
qué está en **revisión manual**. Esa columna no debería tener filas casi nunca;
si las tiene, hay dinero del que no sabemos el desenlace.

## Lo que sigue sin existir a propósito

- **Reintentar a mano.** Mueve dinero, así que será una operación con su propia
  autoridad, no un botón dentro de una tabla de consulta.
- **Repreciar automáticamente.** Una suscripción viva conserva su importe
  congelado hasta una transición comercial explícita.
