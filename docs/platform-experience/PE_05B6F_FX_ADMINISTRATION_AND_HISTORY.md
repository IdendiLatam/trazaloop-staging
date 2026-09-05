# PE-05B6F · El tipo de cambio se administra, y la historia no miente

*Cerrado el 5 de septiembre de 2026. Cabeceras: Local **0182** · Staging **0182** ·
Producción **0111**. Cobros reales al proveedor en este tramo: **0**.*

---

## Dos huecos que B6E dejó a la vista

### 1 · No había manera de poner un tipo de cambio sin abrir una consola

`commercial_fx_rates` existe desde 0169 con su política: escribir es de la
administración de plataforma. Pero el **permiso de tabla solo daba `select`**,
así que la política nunca llegaba a preguntarse: ni un superadministrador podía
insertar una fila desde el producto. Una tasa solo entraba por migración o por
la herramienta de QA.

El día de Producción eso significa que **vender depende de que alguien tenga
psql a mano**. Y faltaban tres invariantes más: dos tasas activas podían
solaparse —y entonces «cuál rige hoy» lo decidía un `order by` en vez de una
decisión—, una tasa ya usada se podía reescribir, y el estado se ponía a mano en
vez de derivarse de las fechas.

### 2 · El historial se inventaba el plan

El historial del cliente deducía el plan de cada cobro mirando la suscripción
**hoy**. Una renovación pagada siendo Full pasaba a decir «Extra» en cuanto la
empresa subía de plan.

Los importes sí eran correctos —base, descuento e impuesto se congelan en el
pago desde 0169—. Lo que no estaba congelado en ninguna parte era **el plan y la
periodicidad de una renovación**: el presupuesto solo se guarda en la
contratación y en la subida, y la obligación no llevaba plan.

---

## 0182

Hacía falta, y por las dos cosas.

| | Qué |
|---|---|
| 1–2 | El tipo de cambio no se solapa consigo mismo, y lo que ya rigió no se reescribe ni se borra. Dos disparadores, porque las políticas no detienen a la llave de servicio |
| 3 | `commercial_fx_create`, `commercial_fx_cancel_scheduled`, `commercial_fx_close_current` |
| 4 | `v_commercial_fx_rates`, con la situación **derivada de las fechas** |
| 5 | `plan_code`, `plan_revision_id` y `billing_interval` en la obligación, congelados al abrirla |
| 6 | Las dos puertas que abren obligaciones los escriben |
| 7 | Y una vez congelada, la identidad no se reescribe |
| 8 | Una suscripción **viva** tiene su obligación, comprobado al cerrar la transacción |

### Cómo funciona abrir una vigencia

Abrir una tasa **cierra la anterior justo donde empieza la nueva**: ni solape ni
hueco, en una sola operación. Retirar una tasa *programada* devuelve la vigencia
abierta a la anterior —si no, la empresa se quedaría sin tasa el día en que la
programada iba a entrar—. Cerrar la vigente es una decisión con consecuencia
dicha: a partir de ese instante **no se pueden fijar precios nuevos**
—contratar, cambiar de plan, subir— y las renovaciones **siguen cobrándose**,
porque su importe ya estaba congelado.

Lo que ya terminó no se reabre. Lo que aún no ha llegado sí se puede mover.

### Y una tasa nueva no vuelve a poner precio a nada

Probado en C1: se abre una tasa **al doble** y no cambia la suscripción, ni un
presupuesto, ni un cobro, ni la obligación siguiente. Una tasa solo se usa para
**decisiones de precio nuevas**.

---

## Dónde vive ahora la verdad histórica

En la **obligación**, que es donde está el dinero:

| Kind | Plan y periodicidad salen de |
|---|---|
| Contratación | el presupuesto (congelado desde 0169) y la obligación #1 |
| Renovación | la obligación, congelada al abrirla |
| Subida de plan | el cambio, con su origen y su destino |

El historial **ya no lee `billing_subscriptions`**, y hay una comprobación
permanente que lo vigila: esa consulta era la causa raíz.

La pantalla del cliente muestra ahora fecha, **concepto** (Suscripción ·
Renovación · Cambio de plan), plan, periodicidad, base, descuento, impuestos con
su tipo, total y estado. Sin vocabulario de proveedor y sin llamarlo factura.

### El relleno, y una corrección

El primer relleno dedujo el plan histórico del rastro de asignaciones vendidas.
En la mayoría acertó, pero **etiquetó mal dos obligaciones de QA** cuya historia
yo mismo había movido hacia atrás para montar los fixtures de B6D y B6E: una
obligación de 400 000 quedó marcada «full» y otra de 160 000, «extra».

Una columna inmutable con un dato deducido mal es peor que una vacía. Así que la
regla se rehízo **conservadora**: solo se rellena lo que se sabe sin
ambigüedad —el presupuesto de la contratación, o una suscripción que nunca
cambió de nivel— y lo demás se queda vacío. El historial dice **«no consta»**,
que es la verdad.

En Staging hubo que deshacer el relleno malo, y para eso se bajó el disparador
de congelado en una transacción y se volvió a subir en la misma. Queda dicho
aquí porque es exactamente el tipo de operación que no debe pasar sin dejar
rastro: se corrigió un error mío, sobre datos sintéticos, y no se tocó nada que
viniera de un presupuesto.

---

## Las tres suscripciones rotas

Inspeccionadas **primero**, solo lectura.

| | Empresa | Creada | Periodos | Pagos | Transacciones reales |
|---|---|---|---|---|---|
| `9560f97d` | QA-PE05B2-MERCADOPAGO | 2026-09-04 02:14 | 0 | 1 | 1 |
| `e00fd119` | QA-PE05B2W-1788489242304 | 2026-09-04 02:34 | 0 | 1 | 1 |
| `f39b8077` | QA-PE05B2W-1788492947686 | 2026-09-04 03:36 | 0 | 2 | 2 |

Las tres son sintéticas: nombres `QA-*`, personas en `test.trazaloop.dev`,
ninguna con medio de pago. **Pero las tres tienen transacciones reales de
Wompi Sandbox aprobadas**, así que su historia financiera no es desechable.

Nacieron antes de 0172, cuando la contratación todavía no creaba la obligación
en la misma transacción.

**Tratamiento:** retiro administrativo por la operación canónica de 0176
(`qa_fixture_retirement`), que las saca de la vida comercial y **no toca ni un
pago**. Ni un `DELETE`, ni un periodo fabricado para que un diagnóstico se
ponga verde, ni una marca de tiempo reescrita. Después: **cero** suscripciones
vivas sin obligación en Staging.

Y para que no vuelva a pasar, 0182 lo comprueba al cerrar la transacción, solo
para los estados vivos: un final no necesita una obligación abierta.

---

## Las pruebas

`npm run test:pe05b6f-truth` · **18 comprobaciones**

- **A1–A6** · abrir cierra la anterior sin hueco; el solape se impide en la
  base; lo que ya rigió no se reescribe ni se borra; una programada se retira y
  la anterior recupera su vigencia; cerrar deja el producto fallando cerrado; y
  solo USD→COP.
- **B1–B2** · soporte lee y no escribe; una empresa cualquiera ni ve la consola
  ni escribe en la tabla.
- **C1** · una tasa nueva no reprecia nada, y la renovación siguiente sigue
  usando el importe congelado.
- **D1–D7** · la obligación guarda su identidad; una renovación pagada siendo
  Full **sigue diciendo Full** tras subir a Extra; un pago anual sigue siendo
  anual tras pasar a mensual; la identidad no se reescribe; el historial no mira
  la suscripción de hoy; retirar una campaña o cambiar el impuesto no toca un
  cobro viejo; y una subida se cuenta como lo que es.
- **E1–E2** · una suscripción no nace viva sin obligación; un estado terminal sí
  puede existir sin ella.

**Vistas fallar**, con dos mutaciones en Local:

| Mutación | Cazada por |
|---|---|
| la obligación nueva nace sin identidad congelada | D2 |
| se retira el guardián de solape | A2, y de rebote A5 |

### Cuatro consecuencias en las suites de siempre

Las reglas nuevas alcanzaron a pruebas que daban por hecho el mundo anterior.
Ninguna se debilitó: en las cuatro se afirma **la misma invariante bajo la
implementación nueva**.

| Dónde | Qué daba por hecho | Cómo se afirma ahora |
|---|---|---|
| doce suites | que su tasa se podía borrar al terminar | se retira, que es lo que hace el producto |
| PE-05B1 · L/M | que se podía insertar una segunda tasa activa a mano | se abre por su operación y se retira después |
| PE-05B5C | que tras retirar cabía una suscripción viva suelta | se vuelve a **contratar**, y se comprueba que nace con su obligación |
| PE-05B6D · I1 | que una vigencia cerrada se podía reabrir | se abre una tasa nueva; una vigencia terminada no se resucita |

---

## Sobre `seed_qa_fx` y `close_qa_fx`

Siguen siendo **solo de QA** y ya no son necesarias para operar: fijar una tasa
es ahora una operación del producto. Viven en una ruta declarada provisional,
negada en Producción, que exige superadministrador y que se niega si las llaves
de Wompi no son de sandbox. Se quedan como herramienta de prueba, y su
exposición en Producción sigue siendo **ninguna**.

---

## Lo que sigue abierto

- `WOMPI_GTW_PRODUCTION_ENABLEMENT_REQUIRED = YES`
- `PRODUCTION_RENEWAL_SCHEDULER_NOT_CONFIGURED = YES`
- **Cinco obligaciones de QA en Staging dicen «no consta»** de plan y
  periodicidad. Es correcto: su historia se movió a mano para montar fixtures y
  deducirla sería inventar. Ninguna es de un cliente.
