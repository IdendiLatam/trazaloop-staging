# PE-05B6E · Subir hoy, bajar sin perder nada

*Cerrado el 5 de septiembre de 2026. Cabeceras: Local **0181** · Staging **0181** ·
Producción **0111**.*

---

## La política deja de ser simétrica, y eso es lo que había que modelar

Hasta 0178, todo cambio de plan esperaba al final del periodo pagado. Esa
simplificación se rompe en un caso concreto y muy real:

> Una empresa con plan **anual**, a 499 MiB de su límite de 500, que necesita
> espacio **hoy**. Decirle que espere siete meses porque su aniversario cae en
> enero no es prudencia financiera: es dejarla sin trabajar.

Desde B6E:

| Operación | Cuándo entra en vigor |
|---|---|
| **Subir** Full → Extra | **inmediato**, en cuanto el pago se confirma |
| **Bajar** Extra → Full | final del periodo pagado |
| **Cancelar** | final del periodo pagado |
| **Cambiar de periodicidad** | final del periodo pagado |

Lo asimétrico no es un descuido: subir amplía capacidad y lo pide el cliente;
bajar reduce algo que **ya pagó**, y quitárselo antes de tiempo sería quedarse
con su dinero.

---

## Lo que se encontró antes de escribir nada

**El modelo no sabía representar una subida.** Y no por poco:

1. `billing_subscription_periods.base_amount` es la base **recurrente** de una
   obligación. La diferencia de una subida no es una base recurrente: es un
   ajuste que ocurre una vez.
2. Un periodo tiene **un** pago que lo salda. Meter la subida ahí obligaría a que
   un periodo tuviera dos, y entonces «¿está saldado?» deja de tener respuesta.
3. La conciliación tenía **dos** puertas —contratación y renovación— y elegía por
   `period_id`. Una subida no tiene periodo propio: habría caído en la rama de
   contratación y la empresa habría acabado con **dos suscripciones** y dos
   calendarios.

Por eso **0181 era necesaria**, y el encargo ya la esperaba.

**Lo que sí estaba, y bien.** El dominio de almacenamiento ya hacía casi todo lo
que pedía el encargo: `OVER_LIMIT` es un estado, no una purga; el guardia solo
mira el crecimiento (`used + requested > quota`), así que borrar y descargar
nunca pasan por él; `p_already_counted_bytes` cubre el reemplazo; y bajar del
cupo vuelve a permitir subir sin que nadie desbloquee nada. El cupo y la cuota de
inteligencia salen del plan **efectivo en el momento**, así que suben en cuanto
la asignación cambia: no hace falta volver a entrar. Ahí no había que
implementar; había que **probarlo**.

---

## 0181, en once piezas

| | Qué |
|---|---|
| 1–3 | **El ancla, explícita.** `period_anchor_at` y `period_anchor_sequence` en la suscripción, con relleno. Los límites del periodo siguiente salen de la era actual, no del periodo 1 |
| 4–6 | **La periodicidad se puede programar**: `scheduled_billing_interval`, `billing_schedule_transition` (plan, periodicidad o ambos), y la aplicación en el borde re-anclando |
| 7–8 | **`billing_subscription_changes`**: la subida como hecho comercial propio, con sus dos bases de periodo completo, sus dos prorrateos, su diferencia, su impuesto y su pago. Y `billing_prorate` |
| 9–11 | **Presupuestar, enviar y conciliar**: `billing_quote_upgrade`, `billing_open_upgrade_intent`, `billing_settle_upgrade_payment` |
| 12 | La conciliación de contratación **niega** los intentos de subida |
| 13 | `billing_request_cancellation` devuelve una palabra, no `true` |
| 14–15 | «No se sabe si se cobró», y la vista de plataforma |

### Por qué el ancla explícita

Los límites de un periodo salen de «ancla + (secuencia − 1) × intervalo», **en un
solo salto**. Si el intervalo cambia a mitad de vida, esa cuenta deja de valer: el
periodo 4 de una suscripción que fue mensual tres meses y ahora es anual no es
«ancla + 3 años». Cada periodicidad abre su **era**, anclada en el borde ya
pagado. Dentro de cada era la invariante sigue intacta.

---

## La aritmética del prorrateo

```
resto  = period_end − ahora           (segundos, del calendario canónico)
total  = period_end − period_start

valor restante actual  = ROUND(base_congelada_actual × resto / total)
valor restante destino = ROUND(base_destino          × resto / total)
diferencia             = destino − actual        ← si no es > 0, falla cerrado
impuesto               = ROUND(diferencia × bps / 10000)
total a pagar          = diferencia + impuesto
```

`round()` sobre `numeric` en PostgreSQL redondea **a la mitad hacia arriba**, que
es el mismo primitivo que ya usaban `billing_tax_amount` y
`billing_usd_minor_to_cop`. Una sola forma de redondear en todo el dominio, y
enteros de punta a punta.

**De dónde sale cada lado.** El valor del plan actual **no se reconstruye del
catálogo**: es la base congelada de esa suscripción, con su descuento si lo tuvo.
Si una empresa contrató Full con un 40 % institucional, se le reconoce lo que
pagó, no lo que cuesta hoy. El precio destino **sí** es una decisión comercial
nueva: sale del catálogo con tasa vigente y se congela como base recurrente
futura. Consecuencia correcta: **como su Full costaba menos, la diferencia es
mayor**, y el cupón de Full **no se hereda** a Extra.

---

## La prueba real en el sandbox

Una sola transacción, sobre datos sintéticos de QA y la fuente **371065** ya
guardada. Ni PAN, ni CVC, ni tokenización, ni fuente nueva.

| | |
|---|---|
| plan | Full mensual → Extra mensual |
| periodo | `2026-08-26T18:35:22Z → 2026-09-26T18:35:22Z` |
| fracción restante | 1 813 862 / 2 678 400 s = **67,72 %** (21 de 31 días) |
| base Full congelada | COP 160 000 |
| base Extra destino | COP 400 000 |
| valor restante de Full | COP 108 386 |
| valor restante de Extra | COP 270 918 |
| **diferencia** | **COP 162 532** |
| IVA 19 % | COP 30 881 |
| **total** | **COP 193 413** → `19 341 300` centavos |
| transacción | `12180854-1788633861-99753` · `APPROVED` |
| referencia | `upg_4c234f62-0e6e-4e64-be6d-d513bc59a6fa` |

**El POST no concedió nada.** Comprobado en el intervalo real: con la transacción
ya aprobada, la empresa seguía en Full con base 160 000. El derecho lo abrió el
evento firmado (`transaction.updated` → `processed · upgraded`).

Después de liquidar: plan **extra**, base recurrente **400 000**, periodo
**intacto** (26-08 → 26-09), ancla **intacta**, **un** periodo, **un** pago de
subida (162 532 + 30 881, sin `period_id`), un solo nivel vendido por módulo
apuntando a Extra, y los módulos exactamente iguales.

Idempotencia: segunda y tercera entrega del mismo evento → `already_settled`,
sigue habiendo **un** pago.

Tasa QA: abierta solo para congelar el precio destino y **cerrada por vigencia**.
Después: `billing_resolve_fx → no_active_rate`, 0 tasas abiertas, y la suscripción
conserva su base de 400 000.

### Dos ramas que estuve a punto de perder

`billing_open_next_period` la redefinen tres migraciones (0172, 0174, 0176), y
0181 la vuelve a redefinir para usar la era de facturación. Al reescribirla dejé
fuera dos ramas heredadas: la de **caducidad**
(`REACTIVATION_REQUIRES_NEW_PURCHASE`, de 0174) y la de **retiro
administrativo** (`RETIRED_SUBSCRIPTION_DOES_NOT_RESUME`, de 0176). Las dos las
cazaron sus suites —B5B y B5C— antes de que llegaran a ninguna parte, y las dos
están restituidas.

La lección, escrita para la próxima: una función que redefine varias migraciones
se reconstruye **entera desde su predecesora real**, y se compara con `diff`
antes de aplicarla. Lo que quede de diferencia tiene que ser exactamente el
cambio que se buscaba, y nada más.

### El defecto que encontró la entrega real

La primera entrega del webhook acabó en **`manual_review · unparseable_reference`**
con el cobro ya hecho. `parseAttemptReference` solo conocía el prefijo `pay_`, y
la subida usa `upg_`. Reparado en `lib/billing/wompi/mapping.ts`, con
`buildUpgradeReference` y una comprobación permanente en la suite de contrato que
obliga a pasar por ahí a quien añada un tercer prefijo. El evento se reentregó
—el mismo, firmado— y liquidó correctamente. **No se creó una segunda
transacción.**

---

## Bajar con 3 GB guardados

Probado de forma determinista, sin subir un solo byte real: la ocupación se
declara por la **contabilidad real** (un objeto huérfano pendiente de retirada,
que es una de las fuentes que el dominio ya suma).

- Extra con 3 GB → se programa Full: **no se rechaza** por ocupar más de lo que
  cabrá después.
- Antes del borde sigue siendo Extra, con su cupo.
- En el borde entra Full: **`OVER_LIMIT`**, uso **idéntico**, y los datos siguen
  contados, es decir, siguen ahí.
- Por encima del cupo: consultar **sí**, descargar **sí**, borrar **sí**,
  reemplazar por algo más pequeño **sí**; crecer **no**
  (`STORAGE_QUOTA_EXCEEDED`).
- Al bajar del cupo, subir vuelve a funcionar **solo**: sin soporte, sin
  superadministrador, sin desbloqueo.

Una empresa no debería tener que elegir entre bajar de plan y conservar sus
evidencias. Esa es la invariante, y se ve fallar: al obligar a borrar antes de
poder bajar, dos comprobaciones se ponen en rojo.

---

## Las pruebas

`npm run test:pe05b6e-upgrade` · **25 comprobaciones** — A–D (subida mensual y
anual, ancla y periodo intactos), E–F (aritmética y redondeo), G–H (descuento
propio reconocido, cupón no heredado), I–K (rechazo, incertidumbre, reentrega,
importe que no cuadra), L (renovación siguiente por el Extra completo), M (500 MB
→ 5 GB y cuota de IA sin borrar consumo), N–Q (3 GB, `OVER_LIMIT`, permisos y
recuperación), T–V (periodicidad y una sola transición pendiente), W–Z
(cancelación, módulos, aislamiento entre empresas, visibilidad de plataforma).

**Vistas fallar**, con tres mutaciones en Local:

| Mutación | Cazada por |
|---|---|
| la subida abre un periodo nuevo de doce meses | A1, B1 |
| se cobra el precio entero del destino, no la diferencia | A1, B1, E1 |
| bajar de plan se niega si se ocupa más de lo que cabrá | N1, O1 |

---

## Decisiones pedidas por el encargo

- **`close_qa_fx` = A · herramienta solo de QA.** Vive en una ruta declarada
  provisional, negada en Producción, que exige superadministrador y que se niega
  si las llaves de Wompi no son de sandbox. No se promueve a producto. Y queda
  anotado que **no existe gestión canónica de tipos de cambio para
  superadministración**: hoy una tasa solo entra por migración o por QA, lo cual
  será un problema el día de Producción.
- **Contrato de cancelación**: normalizado a `cancellation_scheduled` /
  `cancellation_withdrawn`, con `cancel_at_period_end` y `effective_at` intactos.
  Quien la llamaba leía `effective_at`, así que no había nada que romper; hay
  cobertura nueva.
- **Subida + cambio de periodicidad a la vez**: no se implementa. Quien necesite
  Extra hoy sube con su misma periodicidad y programa el cambio de periodicidad
  para el borde.

---

## Lo que sigue abierto

- `WOMPI_GTW_PRODUCTION_ENABLEMENT_REQUIRED = YES`
- `PRODUCTION_RENEWAL_SCHEDULER_NOT_CONFIGURED = YES`
- **Sin gestión canónica de tipos de cambio.**
- **Tres suscripciones de QA en Staging sin ningún periodo** (`9560f97d`,
  `e00fd119`, `f39b8077`), residuo de pruebas anteriores. Ya estaban rotas antes
  de 0181 —`billing_open_next_period` les responde `anchor_missing`— y 0181
  mantiene ese mismo comportamiento. No se tocaron.
- **El historial de cobros deriva el plan de la suscripción actual** para las
  renovaciones, así que una renovación pagada siendo Full se muestra con el plan
  de hoy. Las subidas ya no: llevan su propia etiqueta («Cambio de Full a
  Extra»). Arreglarlo del todo pide congelar el plan en cada obligación.
