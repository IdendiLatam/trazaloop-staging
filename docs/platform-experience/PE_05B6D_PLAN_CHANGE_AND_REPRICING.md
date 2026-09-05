# PE-05B6D · Cambiar de plan, y cobrar el importe nuevo

*Cerrado el 5 de septiembre de 2026. Cabeceras: Local 0180 · Staging 0180 ·
Producción 0111. **Este tramo no creó ninguna migración.***

---

## Lo que había que averiguar

Una sola cosa, y estaba escrita como pregunta abierta desde W3.2:

> `WOMPI_REPRICING_COF_BEHAVIOR = NEEDS_EXPLICIT_VERIFICATION`

Traducida: **una fuente de pago guardada en Wompi, que ya se usó para cobrar un
importe recurrente, ¿sirve para cobrar OTRO importe distinto?**

No es una duda ociosa. En el modelo de Wompi no hay objeto de suscripción: el
calendario y el importe los lleva el comercio, y la tarjeta guardada es solo una
referencia. Si el proveedor hubiera atado la fuente al importe del primer cobro
—como hacen algunos esquemas de débito autorizado—, entonces **subir o bajar de
plan exigiría volver a pedirle la tarjeta al cliente**, y eso cambia el producto
entero: el cambio de plan dejaría de ser una decisión de dos clics para
convertirse en una recontratación.

La respuesta, probada con una transacción real:

> **La misma fuente guardada acepta un importe recurrente distinto. No hay que
> retokenizar, ni pedir la tarjeta otra vez, ni crear una segunda fuente.**

---

## La regla que se estaba protegiendo mientras tanto

Un cambio de plan **no es inmediato**. Entra en vigor **al terminar el periodo
que ya está pagado**. Sin prorrateo, sin abono por el tiempo no usado, sin
devolución parcial y sin cobro incremental a mitad de periodo.

Y «al terminar el periodo pagado» quiere decir exactamente eso, no «el mes que
viene». Para una suscripción anual comprada en enero, un cambio pedido en junio
entra **en enero del año siguiente**, no en julio.

Esta distinción es la que separa un producto correcto de uno que le roba meses a
quien ya pagó. El atajo tentador —`now() + interval '1 month'`— parece
inofensivo en una prueba mensual y es catastrófico en una anual.

---

## La prueba real, paso a paso

Todo sobre datos sintéticos de QA. Ni una fila de la compra humana de W4 se
tocó.

| # | Qué | Resultado |
|---|---|---|
| 1 | Inventario de Staging, solo lectura | dos medios de pago; la fuente **371065** en la empresa QA `08bf4bb6`; la del cliente humano (`bc71771d`) descartada por regla |
| 2 | Retiro canónico de la suscripción QA anterior | `billing_retire_subscription(…, 'qa_fixture_retirement')` → `retired`, 3 asignaciones cerradas |
| 3 | Fixture nuevo, Full mensual con su periodo #1 pagado | periodo `2026-08-04T16:35:28.149Z → 2026-09-04T16:35:28.149Z` |
| 4 | Tasa QA temporal USD→COP = 4000, marcada `QA-SYNTHETIC-NOT-FOR-PRODUCTION` | abierta solo para congelar el importe nuevo |
| 5 | `billing_schedule_plan_change(…, 'extra')` **con sesión de administrador** | congela **COP 400 000**, vigor **2026-09-04T16:35:28.149Z** = el borde del periodo pagado |
| 6 | Cierre de la tasa QA **por vigencia** | `billing_resolve_fx → no_active_rate`, 0 tasas activas |
| 7 | Pasada 1 del corredor, en ejecución | `downgrade_due` → `applied`. **`provider_calls: 0`** |
| 8 | Pasada 2 del corredor, en ejecución | `renew` → `submitted`. **`provider_calls: 1`** |
| 9 | La transacción, leída en Wompi | `amount_in_cents: 47600000` · `APPROVED` · `CARD` |
| 10 | Evento firmado `transaction.updated` | `processed` · `renewed` → periodo #2 saldado |
| 11 | Reentrega del MISMO evento | `already_settled`. Siguen siendo 4 pagos |
| 12 | Pasadas 3 y 4 en ejecución | `due_found: 0`, `provider_calls: 0` |
| 13 | Compuertas retiradas y pasada con las llaves en la mano | `mode: dry_run` |

Y sobre el resultado comercial: los módulos habilitados son **exactamente los
mismos** antes y después (`core` completo; `quality`, `textiles` y
`traceability_6632` en demostración): pagar no encendió ninguno. El periodo #2
está saldado **una vez**, por un único pago de COP 476 000, y el IVA implícito
—76 000 sobre 400 000— es el **19 %** esperado.

Estado final de la empresa QA: **una** suscripción viva, plan **extra**,
mensual, base **COP 400 000**, periodo `2026-09-04 → 2026-10-04`.

### El importe

```
base Extra mensual   COP 400 000     (USD 100 × 4000, congelado al programar)
IVA 19 %             COP  76 000
total                COP 476 000
frontera del proveedor   47 600 000 centavos
```

El cobro salió **sin tasa de cambio vigente**. Podía, porque el importe ya
estaba congelado: convertir es cosa de *fijar* un precio, no de *cobrarlo*. Esa
asimetría —programar exige tasa, renovar no— es de 0178 y aquí se confirmó en
producción real de sandbox.

---

## Lo que el proveedor confirma y lo que no

Confirma, leído de su propia API: importe `47600000`, estado `APPROVED`, medio
`CARD`.

**No** devuelve, en la lectura con llave pública, ni `payment_source_id` ni
`recurrent`. Así que el encaminamiento contra la fuente **371065** se sostiene
sobre dos hechos, no sobre su eco:

1. la petición que salió llevaba `payment_source_id: 371065` y `recurrent: true`
   —es la única forma que tiene el adaptador de cobrar—; y
2. **en este tramo no se recogió ningún dato de tarjeta**. No hubo PAN, ni CVC,
   ni tokenización, ni fuente nueva. Un cobro con tarjeta aprobado sin datos de
   tarjeta solo puede haber salido contra una fuente guardada.

---

## Lo que NO prueba

- No prueba nada sobre la configuración futura de Gateway/RBM en la cuenta de
  producción de la Corporación. Sigue abierto
  `WOMPI_GTW_PRODUCTION_ENABLEMENT_REQUIRED`.
- No prueba el comportamiento anual contra el proveedor: **no se hizo ningún
  cobro anual real**, a propósito. El año se cubre de forma determinista.
- No hay planificador configurado en ningún entorno. Sigue abierto
  `PRODUCTION_RENEWAL_SCHEDULER_NOT_CONFIGURED`.

---

## El año, probado sin tocar la pasarela

`npm run test:pe05b6d-transitions` · **17 comprobaciones**

| | Qué |
|---|---|
| A1–A3 | Mensual Full → Extra: se programa para el borde del mes pagado, hasta ese día manda Full y no se mueve la contabilidad, y en el borde entra Extra con su importe |
| B1–B2 | Full **anual** → Extra anual pedido a mitad de año: entra al cerrar el año, quedan más de 150 días de Full, y en junio no hay ni vencimiento ni cobro ni plan nuevo |
| C1, C2 | Extra → Full, anual y mensual: solo al cerrar su periodo, y bajar de plan no genera ningún abono |
| D1, D2 | Baja anual y mensual: queda apuntada, el servicio sigue hasta el borde, no se devuelve nada, no cae a Free hoy y se puede retirar |
| E1, F1 | El cambio de plan **no** cambia el intervalo, ni toma el precio del otro intervalo, ni corta un año pagado |
| F2 | Cambiar de intervalo **no existe**: la primitiva no admite un intervalo destino |
| G1 | Cambio pedido un día después de comprar el año: siguen quedando más de 360 días |
| H1 | Cambio pedido **un minuto antes** del borde: entra en el borde exacto, y la pasada no lo adelanta |
| I1 | Aplicado el cambio y **cerrada la tasa**, el cobro siguiente pide el importe congelado (Extra + IVA) |
| J1 | Un Full con cupón institucional que pasa a Extra paga el **Extra limpio**: el descuento no se hereda |
| K1 | La pantalla de confirmación dice la fecha, que no se prorratea y que no hay abono |

### Vistas fallar

No basta con que estén en verde. Se sustituyó en Local la línea que busca el
borde canónico por el atajo `now() + interval '1 month'` y se volvió a correr la
suite:

```
6 en verde, 8 en rojo
B1: entra el 2026-10-05 y el año pagado acaba el 2027-03-09
```

Cinco meses robados, cazados por ocho comprobaciones. La definición buena se
restauró desde `pg_get_functiondef` inmediatamente después.

---

## Lo que se cambió en el producto

Ninguna migración. Tres cambios de código:

1. **`app/api/billing/renewals/run/route.ts`** — el registro de la pasada
   escribía siempre `mode: "dry_run"`, también cuando había ejecutado de verdad.
   Una pasada que movió dinero se archivaba como si solo hubiera mirado. Ahora
   escribe lo que pasó.
2. **`components/domain/billing/plan-decisions.tsx`** — la confirmación ya decía
   la fecha; ahora dice también que **no se prorratea el periodo en curso** y
   que **no se genera abono por el tiempo restante**, y la cancelación añade que
   no se devuelve la parte no usada.
3. **La misma pantalla** ofrece ahora el cambio en **las dos direcciones**. Antes
   solo dejaba bajar de Extra a Full: subir de Full a Extra —justo lo que este
   tramo acaba de probar de punta a punta— no tenía puerta en la interfaz.

Y una limpieza: las tres acciones temporales de QA que este tramo necesitó
(`b6d_fixture`, `schedule_plan_change`, `transaction_routing`) se **retiraron**.
Se quedó `close_qa_fx`, porque `seed_qa_fx` prometía en su propio comentario que
la tasa sintética «se cierra por vigencia al terminar» y no existía la operación
que lo hiciera.

---

## Carencias encontradas y NO resueltas

Ninguna justificaba una migración, y el encargo pedía no crearla.

- **Cambiar de intervalo no existe.** No hay forma de pasar de mensual a anual
  ni al revés. No es un defecto —nada hace algo incorrecto— sino una capacidad
  ausente. Queda anotada con prueba (`F2`) para que nadie la improvise
  escribiendo `billing_interval` a mano y parta por la mitad un año pagado.
- **`billing_request_cancellation` devuelve `status: true`**, un booleano, donde
  todas sus hermanas devuelven una cadena (`scheduled`, `applied`, `cancelled`).
  Hoy no rompe nada porque quien la llama lee `effective_at`, no `status`. Es
  una inconsistencia de forma, no de comportamiento.
- **Wompi no devuelve `payment_source_id` ni `recurrent`** al leer una
  transacción con llave pública. No es nuestro. Se documenta arriba cómo se
  sostiene el encaminamiento sin ese eco.

---

## Estado de las compuertas

Las cinco protecciones se encendieron para **una sola** suscripción y se
apagaron al terminar:

- `BILLING_RENEWAL_EXECUTION_ENABLED` — **retirada**
- `BILLING_RENEWAL_EXECUTE_SECRET` — **retirada** (y borrada del disco)
- `BILLING_RENEWAL_EXECUTION_ALLOWLIST` — **retirada**
- `BILLING_RENEWAL_RUNNER_SECRET` — sigue, solo mira
- Producción — **no recibió ninguna**

Comprobado después de apagarlas: con las llaves en la mano, la pasada responde
`mode: dry_run` y `provider_calls: 0`.
