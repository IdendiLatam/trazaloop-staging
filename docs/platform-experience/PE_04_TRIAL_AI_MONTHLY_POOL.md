# PE-04 · La prueba no eleva la bolsa mensual de Intelligence

Corrección: `0170_trial_ai_monthly_pool_fix.sql`.
Hallazgo: [comprobación previa de PE-05B2](PE_05B2_PREFLIGHT_TRIAL_AI.md).

## La asimetría, escrita para que no vuelva a perderse

La prueba de 48 horas da las capacidades de **Full**:

| Eje | Durante la prueba |
|---|---|
| Funciones | las de Full |
| Almacenamiento | 500 MB, los de Full |
| Reloj de uso | sin tope, como Full |
| Acompañamiento funcional | **no**: es de Extra |
| **Créditos de Intelligence** | **50 propios + la mensual del plan NO-prueba** |

Las dos últimas filas son las que rompen la simetría, y las dos son
deliberadas. La de Intelligence es la que se perdió: nadie la había escrito en
el código, así que el resolutor hizo lo que hacía con todos los demás ejes
—leer el plan efectivo, que durante la prueba es Full— y entregó 500.

**La prueba no incluye los 500 créditos mensuales de Full.** Trae su propia
bolsa de 50, que caduca con ella, y deja la mensual como estaba.

## La regla, y por qué no es «25 durante la prueba»

Fijar 25 habría arreglado el caso de hoy y roto el de mañana: un cliente que
compra Full **con la prueba todavía viva** quedaría retenido en 25 créditos
habiendo pagado 500. La regla es otra:

> **bolsa mensual** = la del plan de mayor rango entre las concesiones vivas
> cuyo `grant_kind` **no** sea `trial`.

Los `grant_kind` del modelo son `base`, `trial`, `sold` y `courtesy`. Tres de
los cuatro son concesiones comerciales reales y cuentan; solo la prueba se
excluye, y solo para este recurso.

| Situación | Prueba | Mensual |
|---|---|---|
| Free + prueba | 50 | **25** |
| Free + Full comprado + prueba viva | lo que quede de 50 | **500** |
| Free + Extra comprado + prueba viva | lo que quede de 50 | **2 000** |
| Full de cortesía + prueba | lo que quede de 50 | **500** |
| Quality en Full comprado, PCR en prueba, Textiles en Free | 50 | **500** |
| Full comprado + prueba **de Extra** | 50 | **500** — la prueba no sube |

Comprobado ejecutando, caso por caso, en
`tests/rls/pe04-trial-ai-monthly-pool.test.ts`.

## Un solo sitio donde se decide

`ai_monthly_allowance(empresa, momento)` es el resolutor canónico. Todo camino
que necesite saber cuántos créditos mensuales hay —el estado, la reserva, la
tarjeta del cliente, la consola de Superadmin— pasa por él. Que haya **uno** es
lo que impide que el defecto vuelva por otra puerta.

Debajo, `plan_effective_scan(empresa, momento, excluir_prueba)` tiene la
consulta de ranking **una sola vez**, y de ella salen las dos puertas públicas:

- `plan_effective_for_organization` — el plan del **producto**. Durante la
  prueba devuelve `full`, y eso es correcto: es lo que leen los otros cuatro
  ejes.
- `plan_effective_for_organization_non_trial` — el plan **comercial** sin la
  prueba. Durante esa misma prueba devuelve `free`.

Se extrajo en vez de copiarse. Copiarla habría dejado dos consultas que
envejecen por separado, y la próxima decisión comercial solo se aplicaría a una
de las dos. Es el mismo motivo por el que 0169 extrajo el núcleo de transición
de 0168.

`plan_effective_scan` no tiene permisos para nadie: se entra por una de las dos
puertas, que son las que comprueban identidad.

## Dos conceptos, dos nombres

`ai_credits_status` devuelve ahora los dos:

- `plan_code` — el plan del producto. Durante la prueba, `full`.
- `monthly_plan_code` — de dónde sale la bolsa mensual. Durante esa prueba,
  `free`.

Confundirlos fue exactamente lo que produjo el defecto. Ahora los dos están en
la respuesta, con nombres distintos, y el Superadmin ve la diferencia escrita
cuando existe.

## Sin dato no es cero, y tampoco 25

Si no hay plan no-prueba resoluble —una empresa con una prueba y ninguna base
debajo—, la bolsa devuelve `unavailable` y el estado es `UNAVAILABLE`. **No cae
a 25**: caer a 25 sería inventar una cuota que nadie concedió, y caer a 500
sería regalar la de otro plan.

Y no se presenta como cuota agotada. `AT_LIMIT` u `OVER_LIMIT` le dirían al
cliente que gastó algo que no gastó.

## El orden de consumo no cambia

Primero la bolsa que **caduca**, después la mensual. Al revés se tirarían
créditos que el cliente ya tenía. Los de prueba no usados caducan con ella; la
mensual no se reinicia cuando la prueba termina.

## Lo que ya no ocurre

Antes, una empresa que aceptaba todo lo que el producto le ofrecía durante la
prueba —hasta 550 créditos— quedaba, al caducar, midiéndose contra 25:
`OVER_LIMIT` sin haber excedido nada, y con Intelligence muerta hasta que
cambiara el mes. Justo cuando toca decidir si paga.

Ahora el techo durante la prueba es 75, y al caducar el mes queda como debía:
lo gastado de la mensual, sobre 25, con lo que sobre todavía disponible.

## Lo que la corrección NO hace

No toca ni una fila de `ai_credit_ledger`. Esas ejecuciones ocurrieron:
consumieron tokens, tiempo y dinero del proveedor, y su telemetría es historia.
Reescribirlas para que los libros cuadren sería falsificar lo que pasó.

Lo que sí hace es **decir** quién quedó afectado:
`ai_trial_monthly_overrun()` lista las empresas cuyo consumo mensual supera lo
que da su plan no-prueba, marca cuáles tienen nombre de QA por convención del
repositorio, y **no corrige nada**. Solo la puede llamar `service_role`. La
migración la ejecuta al aplicarse y dice en voz alta lo que encuentra.

En Staging encontró **cero**: el libro de créditos está vacío, así que ninguna
empresa llegó a gastar un solo crédito mientras el defecto estuvo vivo. No hubo
nada que remediar ni ninguna decisión que pedir.

Producción sigue en **0111**, anterior a `0162` y `0166`: allí no existe
ninguna de estas funciones.

## La aserción permanente

La comprobación D/E de `pe04b4-credits-and-clock` miraba la bolsa de la prueba
y el consumo, y **no el techo**. Por ese hueco pasó el defecto. Ahora afirma
`monthly_limit === 25` con la prueba activa, y también que
`monthly_plan_code === "free"` mientras `plan_code === "full"`.

La comprobación D3 de `pe04b6-lifecycle` afirmaba 500 durante la prueba: era la
línea que codificaba el defecto. Afirma 25, y explica por qué la asimetría es
deliberada.

Y hay una suite propia de veinte comprobaciones. Se la vio ponerse roja:
reintroduciendo el defecto en la base, nueve de las veinte caen.
