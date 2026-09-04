# PE-05B5A · El cobro que se hace solo, diseñado antes de escribirlo

Este documento no implementa nada. Decide qué se va a construir, qué invariantes
no se pueden romper y qué hay que arreglar **antes** de que exista un solo
proceso automático moviendo dinero.

---

## 1 · Lo que ya hay, y por qué no se inventa un segundo motor

Barrido del repositorio buscando planificación: `vercel.json`/`vercel.ts` con
`crons` — **no existen**; `pg_cron` — **no instalado**; acciones programadas de
GitHub — **ninguna**; colas, *workers*, *outbox* — **nada**.

Existe **un** precedente transversal, y es bueno:

**`app/api/automation/run`** (QUALITY-11). Un endpoint HTTP protegido por
secreto compartido al que puede llamar cualquier planificador externo. Su
comentario de cabecera explica la decisión, y sigue siendo válida hoy:

> «Crear una habría significado, además, tocar configuración COMPARTIDA con
> Production —un `crons` en `vercel.json` se aplica a los despliegues de
> producción—.»

Sus propiedades, que se copian tal cual:

- secreto en cabecera propia; **404** —no 401— a quien no lo trae, para no
  confirmar que la puerta existe;
- **falla cerrado**: sin secreto configurado, o con uno demasiado corto, el
  endpoint no responde;
- no evalúa nada por su cuenta: llama a las **mismas** funciones canónicas que
  usan los caminos manuales;
- aísla por empresa: una que falla no arrastra a las demás;
- devuelve recuentos, no datos.

Y dos patrones más que se reutilizan:
`quality_automation_runs` como **tabla de observación de pasadas**, y la
idempotencia por **índice único parcial** (`quality_signals_open_dedupe_uniq`)
en vez de «mirar antes de insertar».

**Decisión.** El planificador de cobros nace como un segundo endpoint del mismo
tipo, no como una infraestructura nueva. Cero gestión duplicada.

---

## 2 · Dos defectos encontrados antes de escribir el planificador

No son teoría. Los dos se reprodujeron contra la base local, dentro de una
transacción revertida.

### 2.1 · Una suscripción AL DÍA se declara caducada al vencer

Escenario: periodo 1 **pagado**, vencido hace cuatro horas. Es el instante
exacto en que el planificador tiene que abrir el mes 2.

```
billing_open_next_period(...)
→ {"status": "lapsed", "reason": "REACTIVATION_REQUIRES_NEW_PURCHASE"}
```

**El planificador no podría renovar a nadie.** Jamás. Cada suscripción sana, en
el momento de su vencimiento, sería tratada como una que cayó a Free.

### 2.2 · Y la caducidad de verdad no se detecta nunca

Escenario inverso: periodo 2 **sin pagar**, vencido, con la gracia expirada
hace tres semanas.

```
billing_open_next_period(...)
→ {"status": "open", "reused": true, "period_sequence": 2}
```

Devuelve el periodo impagado como si nada. **Nunca dice `lapsed`.**

### La causa, que es una sola

```sql
if v_ultimo.status = 'open' then  ... return reuse ...   -- ①
if now() > v_ultimo.period_end
   and (grace_until is null or now() > grace_until) then -- ②
  return 'lapsed'
```

La comprobación ② solo puede alcanzarse cuando el último periodo está
**saldado**, porque ① ya se llevó todos los abiertos. Pero «saldado y vencido»
es exactamente la renovación normal, no una caducidad. La rama se escribió
pensando en «el periodo actual está impagado y se acabó la gracia», y ese caso
nunca llega hasta ella.

Es mío, de 0172, y **ninguna prueba lo cubría**: la suite de W3.1 no tiene un
solo caso de gracia ni de caducidad. Se escribió la rama y no se ejerció.

### La regla correcta

| último periodo | reloj | qué debe pasar |
|---|---|---|
| saldado | `now() ≥ period_end` | **renovación normal** → abrir N+1 |
| saldado | `now() < period_end` | renovación anticipada → abrir N+1 |
| abierto | dentro de la gracia | **reintento** → devolver ese mismo |
| abierto | pasada la gracia | **caducado** → `REACTIVATION_REQUIRES_NEW_PURCHASE` |

La gracia se mide desde `period_end` del periodo **impagado**, no desde un
campo que hoy nadie escribe.

---

## 3 · Qué hace el planificador, y qué no

Aburrido a propósito:

1. descubre obligaciones vencidas o reintentables;
2. se asegura de que el periodo canónico existe;
3. resuelve el medio de pago reutilizable;
4. crea **como mucho un** intento vivo para ese periodo;
5. pide el cobro al proveedor a través de `BillingProvider`;
6. anota lo que el proveedor respondió;
7. **espera**.

Lo que no hace, y hay pruebas que lo impedirán: activar planes, liquidar un
periodo porque el POST dijo «aprobado», tocar `organization_modules`, inventar
precio o tipo de cambio, calcular calendario desde `now()`, o saltarse el
webhook.

**El POST no es la verdad financiera.** Lo es el webhook firmado que relee la
transacción en el proveedor. Eso ya está probado en W3.2 y no se toca.

---

## 4 · La verdad de qué vence

Una función canónica, neutral respecto al proveedor:

```
billing_due_renewals(p_now timestamptz, p_limit integer) → setof
```

Selecciona sobre el dominio comercial y **solo** sobre él:

- suscripción viva (`active` o `past_due`);
- **no** `cancel_at_period_end`, **no** con transición programada que termine
  la relación;
- plan de pago (Free y prueba no tienen cobro);
- último periodo **saldado** y `now() ≥ period_end` → toca abrir y cobrar;
- o último periodo **abierto**, dentro de la gracia, y sin intento vivo, y con
  la cadencia de reintento cumplida → toca reintentar;
- con medio de pago activo del mismo proveedor y entorno.

Nada de esto mira el navegador, el panel de la pasarela ni la hora del proceso.

---

## 5 · Tiempos

Con periodo que acaba en `2026-10-04T16:15:19Z`:

| | |
|---|---|
| `due_at` | **= `period_end`** = `2026-10-04T16:15:19Z` |
| primer intento | en cuanto una pasada vea `now() ≥ due_at` |
| `grace_end` | `due_at + 7 días naturales` = `2026-10-11T16:15:19Z` |
| `period_start` de N+1 | `= period_end` de N, **siempre** |
| `renews_at` | `= current_period_end`, mantenido por la liquidación |

**Una pasada tres minutos tarde no mueve nada**, y no por disciplina: porque
`billing_period_bounds` calcula desde el ancla del periodo 1 y el reloj del
proceso no entra en la cuenta. Un cobro aprobado a las 16:18 salda el periodo
que ya empezaba a las 16:15:19.

`grace_start`/`grace_end` se **derivan** de `period_end`. No hace falta —ni
conviene— un campo que alguien pueda desincronizar; `billing_subscriptions.grace_until`
se conserva como lo que ya es: el aviso visible de que hay una deuda.

---

## 6 · La máquina de estados

```
              ┌──────────── periodo N saldado ────────────┐
              │                                            │
        now ≥ period_end                                   │
              ↓                                            │
        [ abrir N+1 ]  ── ya existía ──▶ el mismo          │
              ↓                                            │
        [ N+1 abierto ] ◀──────────────────────────┐      │
              ↓                                     │      │
        ¿hay intento vivo?                          │      │
         sí → RECONCILIAR (§7)                      │      │
         no ↓                                       │      │
        [ crear intento ] ── único por periodo ──┐  │      │
              ↓                                   │  │      │
        [ POST al proveedor ]                     │  │      │
              ↓                                   │  │      │
     ┌────────┼────────┬──────────────┐           │  │      │
  aprobado  rechazado  error de red  422 repetida │  │      │
     │        │            │              │       │  │      │
     │        ↓            ↓              ↓       │  │      │
     │   [ declined ]  [ en vuelo ]  [ ya existe ]│  │      │
     │        │         reconciliar   reconciliar │  │      │
     │        ↓                                    │  │      │
     │   ¿queda gracia? sí → reintento programado ─┘  │      │
     │        no ↓                                    │      │
     │      [ CADUCA → Free ]                         │      │
     ↓                                                │      │
  el webhook firmado salda el periodo ────────────────┴──────┘
```

El planificador **nunca** entra en la caja de la derecha. Solo empuja.

---

## 7 · Idempotencia y la ventana de la caída

Se apoya en cuatro cierres que **ya existen y están probados**, no en un
sistema nuevo:

| cierre | dónde vive | qué impide |
|---|---|---|
| candado de fila sobre el periodo | `billing_settle_period_payment` (`for update`) | que dos pagos salden el mismo mes |
| único intento en vuelo por periodo | índice `bci_period_inflight_uniq` (0173) | que dos trabajadores manden dos cargos |
| idempotencia por pago del proveedor | `(provider, provider_payment_id)` | que un webhook repetido cuente dos veces |
| **el proveedor rechaza repetir la referencia** | Wompi, comprobado | que un reintento ciego cobre dos veces |

Ese cuarto es el que salva la ventana crítica. Comprobado contra Wompi en W4:

```
422 · INPUT_VALIDATION_ERROR · {"reference":["La referencia ya ha sido usada"]}
```

### La caída después del POST

```
intento creado → POST enviado → se pierde la respuesta → el proceso muere
```

Regla: **no se asume que «sin identificador local de transacción» significa
«no se cobró»**. En la pasada siguiente, un intento vivo con envío registrado
se **reconcilia antes de reintentar**:

1. preguntar al proveedor por la referencia `pay_<intento>`;
2. si aparece: registrar lo que diga y dejar que el camino canónico salde;
3. si no aparece: reenviar **con la misma referencia**. Si el cargo existía, el
   proveedor devuelve `422` — y ese 422 es la respuesta: existe, hay que ir a
   buscarlo. Nunca se cobra dos veces.

El paso 3 funciona **aunque el paso 1 no esté disponible**, que es lo que lo
hace seguro.

> **Verificación pendiente (no bloquea la arquitectura).** El adaptador actual
> solo sabe `getTransaction(id)`. Hay que confirmar en la documentación oficial
> si Wompi permite buscar por `reference`. Si no lo permite, el paso 3 es la
> recuperación completa y el paso 1 desaparece; el diseño no cambia.

---

## 8 · Medio de pago

De `billing_payment_methods` y de ningún otro sitio. `provider_subscription_id`
no se toca: es de la otra pasarela y sigue teniendo su unicidad. Se exige
proveedor, entorno, estado activo y **la misma empresa** que la suscripción;
cualquier discrepancia falla cerrado. Ni PAN, ni CVC, ni testigo en bruto —eso
ya lo vigila la guardia de W4.

---

## 9 · Quién manda en el importe

| concepto | campo autoritativo | quién lo fija |
|---|---|---|
| base COP | `billing_subscription_periods.base_amount` | congelado al abrir el periodo, desde `billing_subscriptions.base_charge_amount` |
| moneda | `billing_subscription_periods.charge_currency` | ídem |
| impuesto | `billing_resolve_tax_rule(now())` + `billing_tax_amount(base, bps)` | vigente el día del cobro |
| total | `base + impuesto` | calculado, nunca almacenado en la suscripción |

**El tipo de cambio no se vuelve a mirar.** `billing_settle_period_payment` no
llama a `billing_resolve_fx`: copia `fx_rate_micros` de la suscripción como
procedencia histórica y nada más. Un cliente con Full contratado a 4 000 COP/USD
sigue pagando 160 000 COP aunque el dólar se mueva. Esto ya es así hoy; el
planificador no lo cambia.

---

## 10 · Impuesto: la arquitectura ya respondió

**Efectivo por fecha, resuelto para cada periodo nuevo** (opción B). No es una
interpretación mía: 0169 lo dice en el propio esquema.

> «Lo que se cobra de verdad, y con qué cambio se calculó. El IMPUESTO NO ESTÁ
> AQUÍ, y es deliberado: si se congelara el total con IVA dentro, una futura
> exención obligaría a cancelar y recontratar para quitarlo.»

Y 0172 lo repite sobre el periodo: la base se congela, el impuesto no. Con eso,
una exención futura del IVA para SaaS llega al siguiente cobro sola, sin
reescribir un solo periodo histórico. **No hay ambigüedad y no hay bloqueo.**

---

## 11 · Repreciación

Ninguna, automática. La base COP de una suscripción viva no se mueve porque
cambie el catálogo. Si el precio comercial sube, el planificador **no lo
adopta**: repreciar es una transición comercial explícita, con su decisión y su
aviso. `WOMPI_REPRICING_COF_BEHAVIOR` sigue abierto.

---

## 12 · Reintentos dentro de la gracia

Cadencia propuesta, **contada por intentos anotados y no por pasadas**:

| intento | cuándo | desde |
|---|---|---|
| 1 | `due_at` | vencimiento |
| 2 | `+24 h` | último intento terminal |
| 3 | `+72 h` | ídem |
| 4 y último | `+144 h` (día 6) | ídem, deja margen antes del día 7 |

Máximo **4 cargos** por obligación. Nunca dos a la vez: lo impide el índice.

Clasificación del fallo, que decide si se reintenta:

| clase | ejemplo | qué se hace |
|---|---|---|
| transitorio | red, tiempo agotado, 5xx | reconciliar y reintentar según cadencia |
| fondos insuficientes | rechazo del emisor | reintentar según cadencia |
| duro | tarjeta robada, cuenta cerrada, entrada inválida | **no se reintenta**; se avisa y se espera a la gracia |
| medio de pago inutilizable | fuente revocada | **no se reintenta**; hace falta una tarjeta nueva |
| desajuste de conciliación | importe/moneda/entorno | `manual_review`, **nunca** reintento automático |

Sin tormenta de reintentos: la cadencia sale de la marca temporal del último
intento terminal, así que ejecutar el planificador cada minuto o cada hora da
exactamente los mismos cuatro cargos.

---

## 13 · Durante la gracia

El derecho **sigue pagado**. Un cobro que entra el día 5 salda **el mismo
periodo** y conserva el ancla: no se regalan cinco días ni se pierden. Eso ya
está probado en W3.1 y no se toca.

---

## 14 · Cuando la gracia se acaba

Hace falta **una** operación canónica —hoy no existe—:

```
billing_lapse_subscription(p_subscription_id uuid)
```

Bajo el candado de la empresa, y solo si el periodo sigue abierto y la gracia
venció. Hace exactamente esto:

- suscripción → `ended` (o `past_due` terminal, a decidir en implementación);
- el periodo impagado **se queda como está**: es la deuda, y es evidencia;
- para cada módulo funcional habilitado, `commercial_apply_assignment(...)` con
  la revisión **Free** vigente, `grant_kind = 'sold'`, motivo explícito;
- **no borra nada**: ni datos, ni documentos, ni historial, ni el medio de pago;
- **no apaga módulos**: siguen habilitados, con el nivel de Free;
- el almacenamiento puede quedar por encima del tope de Free, y ahí manda
  PE-04: lectura, descarga y borrado siguen; lo que se bloquea es **crecer**.

El planificador **no toca asignaciones a mano**: llama a esta función. Es la
misma regla que ya cumplen la contratación y la renovación.

---

## 15 · Lo que no se cobra

| estado comercial | ¿renueva? |
|---|---|
| `active` | sí |
| `past_due` dentro de gracia | sí, como reintento |
| `cancel_at_period_end` | **no** — al vencer, caduca a Free |
| bajada programada | **no** por el camino de cobro; es una transición comercial |
| `ended`, `cancelled` | no |
| Free | no hay suscripción de cobro |
| prueba | no se compra |
| asesoría / cortesía | fuera de la contratación automática |

**Cuidado documentado:** `billing_open_next_period` acepta hoy
`cancel_at_period_end`. Es correcto como primitiva —alguien podría querer abrir
ese periodo— pero el planificador **no debe pedírselo**. La exclusión vive en
`billing_due_renewals`, y una prueba lo comprobará.

---

## 16 · Neutralidad de proveedor

```
billing/renewal  (núcleo: vencimientos, periodos, intentos, política)
        └── BillingProvider.chargeStoredPaymentMethod(...)
                ├── Wompi        (implementado)
                └── Mercado Pago (congelado; no debe regresar)
```

Nada del núcleo se llama `wompi_*`. La otra pasarela ya aterriza en el mismo
dominio de periodos desde 0173, y sus pruebas deterministas siguen verdes.

---

## 17 · Qué se puede observar

Una tabla de pasadas, al estilo de `quality_automation_runs`, y por cada
decisión: identificador de pasada, suscripción, periodo, intento, proveedor,
referencia, decisión, número de reintento, próximo reintento, estado seguro del
proveedor, clasificación del fallo y estado de conciliación.

Nunca: PAN, CVC, testigo en bruto, llaves privadas ni testigos de aceptación.

La historia financiera vive en `billing_payments` y en los periodos. La bitácora
observa; **no es la autoridad**.

---

## 18 · Seguridad

Copiando el precedente: endpoint propio, secreto propio en cabecera, **404** a
quien no lo trae, falla cerrado sin secreto, y separación por entorno —el
entorno del intento y el del medio de pago tienen que coincidir con el de las
credenciales, que ya es regla—.

El uso de `service_role` es legítimo aquí: el repositorio ya tiene esa frontera
declarada en `lib/supabase/admin.ts` («reservado para tareas de servidor») y el
webhook y el proveedor ya la cruzan. No se abre una puerta nueva.

Ninguna ruta pública sin autenticar puede mover dinero.

---

## 19 · Cadencia

**Cada hora**, y la verdad financiera no depende de ello: `due_at` sale del
calendario y la cadencia de reintentos de la marca del intento anterior.
Ejecutarlo cada 15 minutos daría el mismo resultado con cuatro veces más
llamadas; cada seis horas también, con hasta seis horas de retraso en el primer
cargo. Una hora es el punto razonable.

**No se configura nada en este tramo.** Y cuando se configure, la decisión
tiene coste: `crons` en `vercel.json` es configuración compartida con
Producción. Por eso el endpoint acepta cualquier disparador externo.

---

## 20 · Operación manual

Visibilidad para plataforma: qué vence, qué está reintentando, qué está en
gracia, qué se quedó sin medio de pago, qué espera al proveedor, qué está en
revisión y qué caducó.

Un reintento manual tiene sentido —una persona que acaba de cambiar de tarjeta
no debería esperar 24 horas—, pero **mueve dinero**, así que sería del
superadministrador, nunca de soporte. Soporte lee. En B5A no se implementa
ninguna pantalla.

---

## 21 · Los intentos de compra que se quedan a medias

El de la revisión visual —`3700a69a`, `created`, sin medio de pago, nunca
enviado— es **inofensivo**, y no por suerte:

- un presupuesto tiene un solo intento vivo, así que no se multiplican;
- para cobrarlo hace falta sesión de administrador y un envío explícito;
- su presupuesto **caduca**, y `billing_settle_payment` rechaza uno caducado o
  consumido: aunque llegara un webhook, no liquidaría.

Queda como está. Un estado `expired` para intentos de compra sería aseo, no
corrección, y **no se mezcla** con la renovación: son ejes distintos. Se anota
como mejora futura de bajo riesgo.

---

## 22 · Matriz de pruebas deterministas

Sin una sola transacción real.

| | caso | qué se demuestra |
|---|---|---|
| A | mensual vencida | abre N+1 desde el ancla y crea un intento |
| B | anual vencida | ídem con paso de un año |
| C | dos pasadas seguidas | segunda no crea nada |
| D | dos trabajadores a la vez | el índice deja un solo intento vivo |
| E | caída antes del POST | siguiente pasada reutiliza el intento |
| F | caída después de aceptado | reconcilia; no manda un segundo cargo |
| G | webhook antes de la respuesta | el periodo salda; la respuesta tardía no altera nada |
| H | webhook duplicado | `already_settled`; sin avance |
| I | tiempo agotado del proveedor | queda en vuelo; reintento tras reconciliar |
| J | rechazo duro | sin reintento automático |
| K | rechazo transitorio | reintento según cadencia |
| L | medio de pago inactivo | no se cobra; se pide tarjeta nueva |
| M | reintento acertado en gracia | salda el MISMO periodo; ancla intacta |
| N | los cuatro intentos fallan | queda impagado, en gracia hasta el día 7 |
| O | gracia expirada | `billing_lapse_subscription`: Free, sin borrar nada |
| P | 31 de enero | 28-feb, 31-mar, 30-abr, 31-may |
| Q | bisiesto | 29-feb → 28-feb determinista |
| R | cancelación al vencimiento | no se cobra; caduca a Free |
| S | bajada programada | no se cobra por el camino de renovación |
| T | Free | no aparece en vencimientos |
| U | prueba | no aparece |
| V | asesoría | no aparece |
| W | entorno cruzado | falla cerrado |
| X | importe distinto | `reconciliation_mismatch`, sin cobro anotado |
| Y | moneda distinta | ídem |
| Z | pago aprobado sobre periodo saldado | `manual_review`; el derecho no avanza |

Y dos que salen de los defectos de §2, que son las que faltaban:

| | caso | qué se demuestra |
|---|---|---|
| AA | suscripción **al día** justo al vencer | abre N+1; **no** dice `lapsed` |
| AB | periodo impagado con gracia expirada | dice `lapsed`; **no** devuelve el periodo |

---

## 23 · ¿Hace falta 0174?

**Sí**, y sobre todo por lo que se encontró.

**Corrección (obligatoria):**
1. `billing_open_next_period` — reescribir la regla de caducidad según §2.

**Funciones nuevas:**
2. `billing_due_renewals(p_now, p_limit)` — la verdad de qué vence.
3. `billing_lapse_subscription(p_subscription_id)` — la caída a Free, canónica.
4. `billing_mark_renewal_failure(...)` — anota el fallo, clasifica y pone
   `past_due`/`grace_until`. **Hoy no hay nadie que escriba esos dos campos.**

**Columnas (mínimas, sobre tablas que ya existen):**
5. `billing_checkout_intents.failure_class` — clasificación neutral del fallo.
   Sin ella, la política de reintentos tendría que adivinar leyendo texto libre.
6. `billing_checkout_intents.provider_submitted_at` — se envió al proveedor.
   Es lo que distingue «nunca salió» de «salió y no sé qué pasó», y sin esa
   distinción la recuperación de §7 no puede decidir.

**Observación:**
7. `billing_renewal_runs` — pasadas y decisiones, al estilo del motor de
   QUALITY-11.

No hay tablas paralelas al dominio de facturación. Todo cuelga de lo que ya
existe.

---

## 24 · Bloqueos y decisiones

**Bloqueo de lanzamiento, no de este tramo:**
`WOMPI_GTW_PRODUCTION_ENABLEMENT_REQUIRED = YES`. Producción con Wompi está
detenida hasta completar el alta de la pasarela y la adquirencia: Wompi Gateway
activo, adquirencia Bancolombia, aceptación de comercio electrónico sin
presencia de tarjeta, recurrencia COF confirmada con Visa y Mastercard,
credenciales de producción emitidas, decisión sobre 3DS/3RI, capacidad de
tarjeta internacional si se necesita, y tarifas negociadas documentadas. **No
impide construir ni probar el planificador en sandbox.**

**Decisiones de producto pendientes (ninguna bloquea la arquitectura):**
- ¿el primer intento va exactamente en `period_end` o unas horas antes? Se
  propone `period_end`. Adelantarlo no cambia el calendario, solo el margen.
- al caducar, ¿la suscripción queda `ended` o `past_due` terminal?
- ¿se permitirá reintento manual del superadministrador?

**Verificación técnica pendiente:** si Wompi permite consultar por
`reference`. El diseño funciona igualmente gracias al 422 comprobado.
