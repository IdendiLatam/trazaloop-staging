# PE-05 · Cierre

*Cerrado el 5 de septiembre de 2026. Cabeceras: Local **0182** · Staging **0182** ·
**Producción 0111**. Producción no se ha tocado.*

## Qué era PE-05

Convertir «Trazaloop tiene planes» en **cobrar de verdad**: presupuestar, cobrar
con tarjeta, renovar solo, cambiar de plan, aplicar cupones y contarlo todo sin
mentir. Probado de punta a punta en el sandbox de Wompi, con transacciones
reales de prueba y eventos firmados.

| Tramo | Qué dejó | Migración |
|---|---|---|
| **A** | Arquitectura congelada: presupuesto, proveedor, webhook, impuestos, moneda, cupones | — |
| **B1** | Cimientos: presupuestos, suscripciones, pagos, impuestos y tipo de cambio con vigencia | 0169–0170 |
| **B2** | Mercado Pago explorado y descartado para el arranque; adaptador y webhooks canónicos | 0171 |
| **B2W** | Wompi en sandbox: fuente de pago, cobro recurrente, webhook real firmado | 0171 |
| **B3** | El periodo como objeto propio, y el medio de pago separado de la suscripción | 0172–0173 |
| **B4** | Contratación con tarjeta desde el navegador | 0173 |
| **B5** | Cobro automático: calendario, reintentos, gracia, fallos, operación y decisiones del cliente | 0174–0178 |
| **B6B/C** | Cupones, e inmutabilidad de la campaña publicada | 0179–0180 |
| **B6D** | Cambio de plan cobrado al importe nuevo sobre la misma tarjeta | — |
| **B6E** | Subida inmediata, bajada no destructiva y cambio de periodicidad | 0181 |
| **B6F** | Administración del tipo de cambio y verdad histórica del historial | 0182 |
| **B6F.1** | La consola comercial, en idioma de negocio | — |

---

## Las cinco ideas que sostienen todo

**El derecho lo abre el evento firmado, nunca el botón.** Ni la vuelta del
navegador, ni la respuesta del POST al proveedor, ni un `200`. Solo un webhook
verificado y conciliado concede plan. Vale igual para contratar, para renovar y
para subir de plan.

**La obligación existe antes que el cobro.** Un periodo de facturación no es un
pago ni un intento: es lo que se debe. Nace del calendario —ancla + N intervalos
en un solo salto, nunca `now() + 1 month`— y se salda una vez. Por eso un cobro
duplicado no puede avanzar el derecho.

**Lo que se congela, se congela.** El importe de una suscripción, el descuento de
un cupón, el impuesto de un pago y ahora el plan de cada obligación. Un cambio
posterior abre una fila nueva; no reescribe la anterior. Una tasa de cambio nueva
no reprecia nada.

**No saber niega, y no borra.** Sin tipo de cambio no se fijan precios nuevos
—pero las renovaciones siguen cobrándose, porque su importe ya estaba
congelado—. Sin cupo comprobable no se sube nada. Y por encima del cupo se
puede seguir leyendo, descargando y **borrando**: agotar un plan no puede
secuestrar las evidencias de nadie.

**La pantalla habla el idioma de quien la usa.** Quien administra escribe `40`,
no `4000`; elige un descuento, no dos porcentajes; cambia «las condiciones del
plan», no crea «una revisión sucesora». La precisión vive dentro; fuera vive el
negocio.

---

## La base comercial

| | Free | Full | Extra |
|---|---|---|---|
| Mensual | USD 0 | USD 40 | USD 100 |
| Anual | USD 0 | USD 400 | USD 1 000 |
| Almacenamiento | 50 MiB | 500 MiB | 5 GiB |
| Créditos de Intelligence | 25/mes | 500/mes | 2 000/mes |
| Tiempo de plataforma | 30 min/día · 300 min/mes | sin límite | sin límite |
| Orientación funcional | — | — | 2 casos/mes, no acumulables |

Precios **antes de impuestos**. El anual de Full son diez meses pagados por doce
de servicio, y es un precio propio: **jamás se reconstruye como doce mensuales**.

**Acompañamiento especializado** no es un plan: es un servicio aparte —USD 380/mes
+ IVA, hasta 4 horas, hora adicional USD 110 + IVA—, sin descuento anual
automático y fuera del motor de cupones. Se contrata a mano.

### Prueba

Free es permanente. La prueba de Full dura **48 horas por módulo funcional
elegible, una sola vez**, y concede funcionalidad y cupo de Full sin límite de
tiempo de plataforma. En inteligencia **no** concede los 500 de Full: da **50
créditos de prueba en total**, que se gastan primero y caducan con ella, además
de los 25 mensuales de Free. El techo mensual lo sigue mandando el plan de pago
más alto que sea válido.

---

## Almacenamiento, y la bajada que no borra

Una sola cuota por empresa. No hay cubos por módulo.

Bajar de plan **nunca borra nada**. Una empresa con 3 GB que pasa a un plan de
500 MB queda en `OVER_LIMIT` con sus datos intactos: puede consultar, descargar,
borrar y reemplazar por algo más pequeño; lo único bloqueado es **crecer**. Al
bajar del cupo, subir vuelve a funcionar solo —sin soporte, sin desbloqueo—. Lo
mismo al caer a Free por baja o por impago.

Obligar a borrar evidencias para poder bajar de plan convertiría el precio en un
secuestro de datos. Es una invariante de producto, y se ve fallar cuando se
rompe.

---

## Inteligencia

Los créditos ponderados del cliente son de Trazaloop, no del proveedor: no se
publican tokens, ni coste, ni telemetría de terceros. Subir de plan **no borra lo
ya consumido**: eleva el techo que aplica en la ventana en curso.

---

## Cupones

Cadena canónica: campaña → código → canje → instantánea del presupuesto →
instantánea de la suscripción. La administra plataforma; soporte lee; la empresa
solo escribe **un código**. El porcentaje, el importe, el impuesto y el total
salen del servidor.

**Institucional Full**: solo Full, hasta el **40 %** —configurable: 10, 20, 25,
30 o 40—. El 45 % se rechaza en la pantalla, en el servidor y en la base. Ese 40 %
es de *ese programa*, no un techo universal del sistema.

**Duración = vida de la suscripción** que lo canjeó, y sale gratis: la base
congelada ya está descontada, así que renovar no revalida la campaña. Retirar o
caducar una campaña **bloquea canjes nuevos** y no reescribe ni un canje, ni un
presupuesto, ni una suscripción, ni un pago. El cupón de Full **no se hereda** a
Extra. No hay acumulación en el arranque. Un descuento anual se aplica sobre el
precio anual canónico.

---

## Administrar los planes

Una revisión publicada **no se edita**. Cambiar condiciones crea una versión
nueva por dentro; lo anterior queda en el historial porque hubo empresas que
contrataron con ello.

Lo que se lee: **«Cambiar condiciones del plan»**, **«Nuevas condiciones —
Borrador»** con la versión debajo, **«Historial de condiciones»**, y dos campos
con nombre —**Precio mensual (USD)** y **Precio anual (USD)**— donde se escribe
`40`, no `4000`. La conversión a centavos la hace el **servidor**, en enteros; un
separador de miles se rechaza diciendo cómo escribirlo, porque «1.000» es mil
para unos y uno para otros y adivinarlo sería inventar un precio.

---

## Impuestos

Tratamiento del arranque: **19 % de IVA** en Full, Extra y Acompañamiento.

La exención de software de autoservicio **no está activa** y no se supone: exige
validación contable, legal y de MinTIC antes de cualquier cambio prospectivo en
Producción. Precio e impuesto viajan separados; el impuesto de un pago pasado es
inmutable y una regla nueva solo aplica hacia delante.

---

## Tipo de cambio

Catálogo en **USD**, cobro en **COP**. `commercial_fx_rates` es la única
autoridad, y es una tasa **administrativa** que decide la plataforma: no es la
TRM ni el mercado en vivo, y no se consulta ninguna API al cobrar —el cliente
tiene que ver el importe exacto antes de pagar, y una API caída no puede impedir
vender—.

Superadministración crea, programa, cierra y consulta desde `/platform/plans`.
Soporte lee. Una empresa no administra nada. Abrir una vigencia cierra la
anterior justo donde empieza la nueva: **sin solape y sin hueco**. Lo que ya
rigió o ya puso precios **no se reescribe ni se borra**.

Una tasa nueva **no altera** ninguna suscripción, presupuesto, pago, transición
programada ni subida ya congelada. Y **renovar no necesita tasa vigente**.

---

## Contratar y pagar

Contratar es del administrador de la empresa. Free y la prueba no piden
proveedor. El presupuesto lo hace el servidor y vive **30 minutos**: precio de
catálogo en USD, descuento del cupón, tipo de cambio, impuesto e importe final en
COP.

La tarjeta se tokeniza **del navegador a Wompi**, sin pasar por Trazaloop:

```
PAN_SERVER_EXPOSURE = NONE
CVV_SERVER_EXPOSURE = NONE
RAW_CARD_TOKEN_DURABLE_STORAGE = NONE
```

El navegador nunca es autoridad de un importe.

---

## Lo probado en el sandbox de Wompi

Todo con transacciones reales de prueba y eventos firmados, sobre datos
sintéticos de QA.

| | |
|---|---|
| `FIRST_WOMPI_PAYMENT` | VERIFIED_SANDBOX |
| `RECURRING_PAYMENT_SOURCE` | VERIFIED_SANDBOX |
| `WEBHOOK_APPROVED_SETTLEMENT` | VERIFIED_SANDBOX |
| `WOMPI_PAYMENT_SOURCE_REUSE` | VERIFIED_SANDBOX |
| `WOMPI_PERIOD_RENEWAL` | VERIFIED_SANDBOX |
| `WOMPI_CHECKOUT` | VERIFIED_SANDBOX |
| `REAL_RUNNER_WOMPI_RENEWAL` | VERIFIED_SANDBOX |
| `WOMPI_RENEWAL_WEBHOOK_SETTLEMENT` | VERIFIED_SANDBOX |
| `RENEWAL_WITHOUT_ACTIVE_FX` | VERIFIED_SANDBOX |
| `EXPLICIT_PLAN_CHANGE_RECURRING_AMOUNT` | VERIFIED_SANDBOX |
| `WOMPI_REPRICING_COF_BEHAVIOR` | VERIFIED_SANDBOX_FOR_EXPLICIT_PLAN_CHANGE |
| `IMMEDIATE_PAID_UPGRADE_SANDBOX` | VERIFIED |

Y una defensa que no escribimos nosotros: **Wompi rechaza una referencia
repetida**. Como la referencia es el intento, un reintento ciego no puede cobrar
dos veces.

---

## Renovar

El periodo, el intento y el pago son tres cosas distintas. Los periodos están
anclados al calendario.

Reintentos anclados al vencimiento: **0 h · 24 h · 72 h · 144 h**, gracia de
**168 h / 7 días naturales**. Un hueco se consume solo cuando la petición cruzó
de verdad la frontera del proveedor.

Clases de fallo: `retryable_decline`, `hard_decline`, `provider_unavailable`,
`provider_unknown`, `integrity_mismatch`, `payment_method_unavailable`. Lo que no
se sabe **falla cerrado**: no se concede, no se declara fallido y **no se vuelve
a cobrar con otra referencia**. Lo mira una persona.

El dominio está **cerrado en sandbox**. **No hay planificador en Producción**, y
configurarlo es trabajo de PE-06.

---

## Irse, bajar, subir y cambiar de periodicidad

| Operación | Cuándo |
|---|---|
| **Cancelar** | final del periodo pagado; sin abono, sin corte anticipado, y se puede retirar antes |
| **Bajar** Extra → Full | final del periodo pagado; sin prorrateo ni abono |
| **Cambiar de periodicidad** | final del periodo pagado; un año pagado **nunca** se acorta |
| **Subir** Full → Extra | **inmediato**, con la misma periodicidad, pagando la diferencia |

La subida cobra `ROUND(base_destino × resto/total) − ROUND(base_actual ×
resto/total)`, más impuesto sobre esa diferencia. El valor del plan actual sale
de **su base congelada** —con descuento si lo tuvo—, nunca del catálogo de hoy; y
por eso un Full con cupón produce una diferencia *mayor*, que es lo correcto. El
derecho se concede solo tras liquidar, **la fecha de renovación no se mueve**, y
la renovación siguiente cobra el Extra completo.

Subir y cambiar de periodicidad a la vez **no se implementa**: quien necesite
Extra hoy sube con su misma periodicidad y programa el cambio para el borde.

---

## La historia no miente

Cada hecho financiero puede contarse con lo que se sabía entonces: concepto,
plan, revisión, periodicidad, base, descuento, impuesto, total, estado y momento.
La identidad comercial se congela **en la obligación**, que es donde está el
dinero, y un cambio posterior de plan, de periodicidad, de campaña, de tasa o de
regla fiscal **no la reescribe**.

El historial **nunca** deriva el plan de la suscripción actual —esa era la causa
raíz— y hay una comprobación permanente que lo vigila.

En `/settings/billing` se ve: Fecha · Concepto (**Suscripción**, **Renovación**,
**Cambio de plan**) · Plan · Periodicidad · Base · Descuento · Impuestos · Total ·
Estado. Sin vocabulario de proveedor. Y **no se llama factura**: no hay
facturación electrónica DIAN.

---

## Derechos y módulos

El plan de pago es **de la empresa**, no de un módulo. Pagar **no concede
módulos**: el nivel contratado se aplica a los módulos funcionales que ya estén
legítimamente habilitados. Habilitar otro módulo con un plan de pago vigente
hereda el nivel **sin una segunda suscripción**. Pruebas, cortesías y decisiones
manuales pueden dejar estados comerciales mixtos, y eso es historia, no defecto.

## Soporte

Free y Full: reporte de incidencias técnicas. Extra añade **2 casos de
orientación funcional al mes**, no acumulables, con objetivo de primera respuesta
de un día hábil. El Acompañamiento es otro servicio y **no se suma** a esos dos
casos.

---

## Seguridad

- **0** tablas base de `public` sin RLS, en Local y en Staging.
- Aislamiento entre empresas probado; cada empresa ve solo lo suyo.
- Escritura comercial: solo superadministración. Soporte **solo lee**.
- Ningún dato de tarjeta toca el servidor, y ninguna vista de plataforma expone
  vocabulario del proveedor que no se pueda enseñar.
- Las vistas que corren como propietario están **clasificadas una a una** y
  filtran por dentro.

---

## Deuda histórica aceptada

**Cinco obligaciones de QA en Staging** no tienen plan ni periodicidad: su
historia se movió a mano para montar fixtures y deducirla sería inventar. Se
muestran como **«no consta»**. Son solo de QA, y no se rellenan ni se reescriben.

**Cuatro transacciones reales de sandbox** de fixtures ya retirados se conservan
enteras. Nada se borra.

---

## Estado

```
PE-05_FUNCTIONAL_IMPLEMENTATION   = PASS
PE-05_SANDBOX_PAYMENT_LIFECYCLE   = PASS
PE-05_COMMERCIAL_ADMINISTRATION   = PASS
PE-05_HISTORICAL_TRUTH            = PASS
PE-05_HUMAN_UX                    = PASS
PE-05_SECURITY                    = PASS

PE-05_PRODUCTION_DEPLOYED         = NO
PE-05_PRODUCTION_CUTOVER_READY    = CONDITIONAL_ON_PE06_GATES
```

Las puertas que faltan están en
[`PE_05_PRODUCTION_CUTOVER_CARRYOVERS.md`](PE_05_PRODUCTION_CUTOVER_CARRYOVERS.md).
