# PE-05B2W2 · La puerta está lista · falta registrarla en Wompi

Wompi solo manda eventos a una URL que esté registrada en su panel. Esa parte
la tiene que hacer una persona, así que aquí se para.

## La URL

```
WOMPI_SANDBOX_EVENT_URL_BASE =
https://trazaloop-production-l0ppneni6-idendi-latam-s-projects.vercel.app/api/billing/webhooks/wompi
```

A esa base hay que **añadirle su parámetro de bypass de Vercel**, el del
secreto dedicado *Wompi Sandbox Webhook*:

```
…/api/billing/webhooks/wompi?x-vercel-protection-bypass=<SU_SECRETO>
```

**No hace falta decírmelo.** No lo pido, no lo imprimo y no lo guardo.

Se registra **solo en Sandbox**. Wompi exige una URL de eventos por entorno
precisamente para que no se mezclen datos de prueba y de producción; en
Producción no se registra nada.

## Lo comprobado antes de entregarla

| | |
|---|---|
| Sin bypass · `POST` | **401** — la protección sigue puesta |
| Sin bypass · `GET` | **302** hacia el SSO |
| Con bypass · evento **sin firma válida** | **401 `invalid_signature`** |
| Efecto financiero de ese intento | **ninguno** · 0 cobros, 0 suscripciones |
| Cómo quedó anotado | `signature_verified: false` · `ChecksumMismatch` · `rejected` · **sin cuerpo** |

**El bypass de Vercel es acceso de transporte, no autenticación del
proveedor.** Llegar a la puerta y ser creído son dos cosas distintas, y la
segunda la decide la firma.

## La ruta, revisada punto por punto

`/api/billing/webhooks/wompi`

- solo `POST` (el `GET` únicamente responde que está viva);
- **sin sesión** de Trazaloop y sin usuario: el que llama es una máquina;
- **sin atajo de `service_role`** en la ruta;
- exige firma del proveedor, comparada en **tiempo constante**;
- firma inválida → **401**, y ninguna llamada con efecto ocurre antes;
- guardia de entorno, y **falla cerrado** si las llaves no son coherentes;
- **relee la transacción** en la API antes de conciliar;
- liquida por `billing_settle_provider_payment`, la primitiva de siempre.

## El guardia de entorno · las dos evidencias

El contrato de eventos de Wompi **siempre** incluye `environment`, y sus dos
únicos valores son **`test`** en Sandbox y **`prod`** en Producción.

Se exigen las dos cosas, y **ninguna sustituye a la otra**:

- la **firma**, que demuestra que el mensaje viene de quien tiene el secreto de
  ese entorno —Wompi obliga a una URL y un secreto por entorno—;
- el **campo**, que declara el entorno y debe coincidir con las llaves.

Que falte no es que dé igual: se rechaza. Y no hay alias —ni `sandbox`, ni
`production`, ni mayúsculas—: el contrato dice dos valores y son esos dos.

*Antes de esto había relajado la regla apoyándome en un renderizado incompleto
de la documentación, y saqué una conclusión de lo que no había verificado.
Corregida y endurecida.*

### Los cinco casos, ejecutados contra la ruta real

El secreto de eventos vive en el servidor, así que un evento con firma
**válida** solo se puede construir ahí. El disparador provisional lo hace —y no
puede cobrar nada por construcción: la ruta relee la transacción en Wompi antes
de liquidar, así que un identificador inventado no llega al dinero—.

| Caso | Resultado anotado |
|---|---|
| firma OK · `environment: "test"` | **pasó los dos guardias** · se detuvo en la relectura, sin tocar dinero |
| firma OK · `environment` **ausente** | `rejected` · `environment_mismatch` |
| firma OK · `environment: "prod"` | `rejected` · `environment_mismatch` |
| firma OK · `environment: "sandbox"` (alias) | `rejected` · `environment_mismatch` |
| **firma rota** · `environment: "test"` | `rejected` · `ChecksumMismatch` · **sin cuerpo** |

**0 cobros y 0 suscripciones** en los cinco.

**`WOMPI_EVENT_ENVIRONMENT_GUARD = PASS`.**

### Por qué un rechazo de entorno responde 200 y una firma rota responde 401

Son noticias distintas para el proveedor. Una firma inválida es un problema del
mensaje y merece un **401**. Un evento auténtico pero de otro entorno ya está
decidido: reintentarlo no cambiaría nada, así que se acusa recibo con **200** y
se deja en cuarentena anotado. Es acuse y aislamiento, no aceptación: no se
liquida nada y queda escrito por qué.

## Lo que queda para cuando la URL esté registrada

Un cobro nuevo y controlado sobre la **misma fuente de pago** —sin volver a
tokenizar y sin crear otra—, con `recurrent: true`, referencia nueva e importe
de B1. Después: evento real, firma, relectura, conciliación, y **exactamente
una** liquidación.

## Carryovers, intactos

- **`BROWSER_TOKENIZATION_REQUIRED_BEFORE_WOMPI_PROVIDER_CLOSURE = YES`.** La
  tokenización desde el servidor vive solo en el disparador provisional y **no
  se normaliza**. El camino de producto es navegador → Wompi → token → nuestro
  servidor. PAN y CVV no entran nunca.
- **`WOMPI_RENEWAL_SCHEDULER_REQUIRED = YES`.** No se implementó nada, y una
  prueba lo comprueba por nombre.
- **`WOMPI_REPRICING_COF_BEHAVIOR = NEEDS_EXPLICIT_VERIFICATION`.** `recurrent`
  está documentado para cobros periódicos del **mismo importe**; que una
  suscripción con precio cambiado conserve las mismas garantías de credencial
  en archivo **no está verificado**, y no se supone. No bloquea el cobro a
  precio congelado.
