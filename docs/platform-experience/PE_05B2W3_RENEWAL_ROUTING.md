# PE-05B2W3 · Contratar y renovar son cosas distintas

## El hueco del fixture era mío

La empresa de QA se insertaba **a mano** en `organizations`. Quien provisiona
los módulos es `create_organization`, que llama a
`provision_new_organization_modules`; saltándomela, `organization_modules`
quedaba vacío y la liquidación no tenía a qué conceder el plan.

Ahora se crea **como la crearía una persona**: con su sesión y por la función
canónica. Y `prepare` dice, **antes de cobrar**, qué módulos quedaron
habilitados:

```
core (no funcional, full) · traceability_6632 (demo) · textiles (demo) · quality (demo)
módulos funcionales habilitados: 3
```

No se toca `organization_modules` a mano, y desde luego nada se habilita como
efecto de haber pagado.

## La referencia · lo que estaba mal de raíz

Antes era `<intento>-<nº>`. Eso decía que **una contratación puede cobrarse
varias veces**, y no puede: una contratación es un cobro. Los cobros
siguientes son **renovaciones**, y cuelgan de la suscripción, no del intento
que la creó.

```
int_<uuid>          la CONTRATACIÓN
sub_<uuid>_<n>      la RENOVACIÓN de una suscripción viva, con su periodo
```

El separador es `_` y no `-` a propósito: un UUID ya lleva guiones, y separar
con guion obliga a adivinar dónde acaba. **Aquí no se adivina nada**: solo el
formato exacto se reconoce, y lo que no —el UUID desnudo, el formato viejo, un
prefijo pegado, una secuencia cero— va a **revisión**. Cuando ya se movió
dinero, adivinar es lo peor que se puede hacer.

## El enrutado lo decide el estado, no la referencia

La referencia dice **qué objeto** es; el camino lo decide la base:

- `int_…` → `billing_settle_provider_payment`, que ya se niega a liquidar dos
  veces el mismo presupuesto;
- `sub_…` → **exige que la suscripción siga viva** y que su destino de cobro se
  conozca, y llama a `billing_record_renewal_payment`.

Renovar una suscripción terminada sería resucitarla por la puerta de atrás. Una
prueba lee la rama de renovación y comprueba que **no** llama a la creación
inicial: si lo hiciera, crearía una segunda suscripción.

## Lo que pasó de verdad

### Contratación

| | |
|---|---|
| Referencia | `int_4d96bc8f-…` |
| Transacción | `12180854-1788492966-47695` · **APPROVED** · 190 400 COP |
| Evento real | firmado · `processed` · **`activated`** |
| Cobros | 1 |
| Suscripciones vivas | **1** · `full` · `active` · 09-04 → 10-04 |
| **Asignaciones vendidas** | **3** → `quality`, `textiles`, `traceability_6632` |
| `core` | **no** recibió plan: no es funcional |
| Módulos habilitados | **sin cambios** — pagar no habilitó nada |

**`WOMPI_INITIAL_ENTITLEMENT = VERIFIED_SANDBOX`**

### Renovación

Un intento canónico propio, colgado de la **suscripción** y no del intento que
la creó, con su número de periodo. El importe lo resuelve B1: base congelada +
**la regla fiscal vigente**, no una copia del total de la contratación —si
mañana cambia el impuesto, la renovación debe cobrar el nuevo—.

| | |
|---|---|
| Referencia | `sub_f39b8077-…_2` |
| Transacción | `12180854-1788493351-52807` · **APPROVED** · 190 400 COP |
| Evento real | firmado · `processed` · **`renewed`** |
| Cobros | **2**, distintos |
| Suscripciones vivas | **1**, antes y después |
| Periodo | avanzó **una vez** · 03:36 → 03:42, fin 10-04 |
| Asignaciones vendidas | **3**, sin duplicar |
| Módulos | sin cambios |

**`WOMPI_RENEWAL_ROUTING = VERIFIED_SANDBOX`**

### Reentregas

Seis entregas del mismo evento de renovación:

```
attempt_count: 6 · una fila · outcome: already_settled
cobros: 2 · suscripciones vivas: 1 · periodo SIN avanzar otra vez
```

**`WOMPI_RENEWAL_IDEMPOTENCY = VERIFIED`**

## Lo que falla cerrado

Comprobado contra base real, sin proveedor:

- renovación con **importe** de menos → `reconciliation_mismatch`, sin anotar;
- renovación en **otra moneda** → igual;
- **destino desconocido** → `reference_unknown`;
- evento de **producción** sobre entorno de pruebas → `environment_mismatch`;
- reentrega → `already_settled`, periodo intacto;
- y en ninguno de esos casos aparece una segunda suscripción viva.

## Sin migración

**La cabecera sigue en 0171.** No hizo falta ninguna estructura nueva:

- la contratación ya tenía su objeto —`billing_checkout_intents`—;
- la renovación se identifica por **suscripción + periodo**, que ya existen;
- el medio de pago del proveedor se guarda en el mismo campo donde el otro
  proveedor guarda su suscripción, porque para el dominio son lo mismo: *el
  identificador con el que se le cobra a esta suscripción*.

Ninguna columna con nombre de pasarela, ninguna tabla de renovación, ningún
segundo motor.

## Una guardia que se afinó

La comprobación «el único camino al derecho pasa por la primitiva de B1»
buscaba el **nombre** de las tablas y no distinguía una consulta de una
escritura. El enrutado necesita **leer** el estado de la suscripción —hacerlo a
ciegas sería peor—, así que ahora prohíbe `insert`, `update`, `delete` y
`upsert`, y sigue prohibiendo tocar la concesión del derecho. Vista fallar con
un `update` directo.

## Carryovers

- **`BROWSER_TOKENIZATION_REQUIRED_BEFORE_WOMPI_PROVIDER_CLOSURE = YES`**
- **`WOMPI_RENEWAL_SCHEDULER_REQUIRED = YES`** — el calendario sigue sin
  existir. Lo que se probó es **a dónde debe llamar** cuando exista.
- **`WOMPI_REPRICING_COF_BEHAVIOR = NEEDS_EXPLICIT_VERIFICATION`**
- ~~`WOMPI_RENEWAL_ROUTING_REQUIRED`~~ · **cerrado**
- ~~`QA_FIXTURE_NEEDS_ENABLED_MODULE`~~ · **cerrado**
