# PE-05B2W2 · La puerta está lista · falta registrarla en Wompi

Wompi solo manda eventos a una URL que esté registrada en su panel. Esa parte
la tiene que hacer una persona, así que aquí se para.

## La URL

```
WOMPI_SANDBOX_EVENT_URL_BASE =
https://trazaloop-production-28xplfvfc-idendi-latam-s-projects.vercel.app/api/billing/webhooks/wompi
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

## Una corrección hecha antes de entregar la URL

La ruta exigía que el evento declarara `environment: "test"`. Pero el ejemplo
oficial de `transaction.updated` **ni siquiera trae ese campo**, y su valor en
sandbox no está documentado: con esa regla, una entrega legítima habría sido
rechazada y el registro habría sido en balde.

La regla correcta es más fuerte, no más laxa: **el entorno lo establece la
firma**. Wompi exige una URL y un secreto por entorno, así que una firma que
cuadra con el secreto de pruebas demuestra de dónde viene el evento —evidencia
criptográfica, no una declaración del propio mensaje—. Y el campo, **cuando
viene**, no puede contradecirla: si dice producción sobre llaves de pruebas, o
trae un valor que no se sabe leer, se rechaza.

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
