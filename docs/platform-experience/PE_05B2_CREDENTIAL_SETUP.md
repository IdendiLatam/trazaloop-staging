# PE-05B2 · La puesta a punto que necesita una persona

Nada de lo que sigue lo puede hacer el código: hace falta una cuenta de Mercado
Pago y decisiones de infraestructura.

**No hace falta pegar ningún valor secreto en una conversación.** Todo se
configura en los paneles correspondientes.

## 1 · Cuentas de PRUEBA

En el panel de Mercado Pago Developers, dentro de la aplicación:
**Cuentas de prueba** → crear **dos**: una **vendedora** y una **compradora**.

- No se usa la cuenta real para el sandbox.
- No se mezclan las identidades: la vendedora emite las credenciales, la
  compradora es la que paga.

## 2 · Credenciales de prueba

En la aplicación → **Credenciales de prueba** → copiar el **Access Token**, que
empieza por `TEST-`.

El entorno se deduce de ese prefijo: no hay que configurar ninguna variable
adicional que diga «pruebas».

## 3 · Clave de firma del webhook

En la aplicación → **Webhooks** → **Configurar notificación** → revelar la
**clave secreta**.

## 4 · Variables de entorno

Solo dos, ambas **de servidor**:

| Nombre exacto | Qué es |
|---|---|
| `MERCADOPAGO_ACCESS_TOKEN` | el token de prueba, con prefijo `TEST-` |
| `MERCADOPAGO_WEBHOOK_SECRET` | la clave de firma de las notificaciones |

Dónde ponerlas:

- **Local**: en `.env.local`, junto a las demás.
- **Preview de Vercel**: Project → Settings → Environment Variables, ámbito
  **Preview** únicamente.

**Nunca con prefijo `NEXT_PUBLIC_`**: viajarían al navegador y dejarían de ser
secretas. **Nunca en Production.**

Hace falta **redesplegar el Preview** después de añadirlas: las variables se
leen en tiempo de ejecución del servidor, y el despliegue vivo no las toma
solo.

## 5 · La URL del webhook

```
https://<dominio-del-preview>/api/billing/webhooks/mercadopago
```

Temas que hay que marcar:

- `subscription_preapproval`
- `subscription_authorized_payment`
- `payment`

## 6 · El obstáculo real: el Preview está protegido

Los despliegues de Preview de Trazaloop están detrás de **Vercel SSO**. Mercado
Pago no puede autenticarse contra eso, así que su entrega devolverá la pantalla
de acceso en vez de llegar a la ruta.

**No se desactivó la protección, y no debe desactivarse.** Un Preview público
expone la aplicación entera —datos de QA incluidos— para resolver un problema
de un solo endpoint.

Las salidas posibles, para que la decida una persona:

1. **Protection Bypass for Automation.** Vercel ofrece un secreto que permite
   saltarse el SSO para peticiones automatizadas, pasándolo por cabecera o por
   parámetro. Sirve si el proveedor puede incluirlo en la URL registrada. Es la
   opción menos invasiva y la primera que hay que evaluar.
2. **Un dominio dedicado** para el Preview de facturación, con la protección
   ajustada solo ahí.
3. **Un túnel** hacia un entorno local durante la sesión de pruebas, con la URL
   del túnel registrada temporalmente en Mercado Pago.
4. Esperar a un entorno de Staging desplegado sin SSO, si llega a existir.

Ninguna se puede elegir desde el código: las cuatro tocan configuración de
infraestructura de la cuenta.

## 7 · Lo que queda por hacer con manos humanas

- Crear las cuentas de prueba y copiar las credenciales.
- Poner las dos variables en Local y en Preview.
- Decidir cómo llega el webhook sin debilitar el SSO.
- Registrar la URL y marcar los tres temas.
- Autorizar una suscripción de prueba en el navegador con la cuenta
  compradora: ese paso es interactivo por diseño y no se puede automatizar.

Con eso hecho, quedan por ejecutar las nueve pruebas de sandbox listadas en
[las pruebas](PE_05B2_SANDBOX_TESTS.md), y en particular la que decide si el
cobro anual existe.
