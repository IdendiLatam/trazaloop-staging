# PE-04B6 · La verdad comercial

## Un defecto real, encontrado por la aceptación integrada · RESUELTO en 0168

> **Una bajada de plan no baja el plan.**

`commercial_assign_plan` **añade** una asignación y no cierra la anterior. El
resolutor toma la de mayor rango entre las activas, así que asignar Full a una
empresa que ya tiene Extra la deja… en **Extra**.

Reproducido en aislamiento, con las dos llamadas devolviendo `ok`:

```
asignar extra  → ok → plan: extra
asignar full   → ok → plan: extra      ← la bajada no bajó nada
asignaciones vivas: … 'sold' extra (sin fin) … 'sold' full (sin fin)
```

### Por qué importa

La consola de PE-04B5 ofrece «Transición comercial» como **única** vía para mover
a una empresa de plan, y muestra un aviso de impacto de bajada —almacenamiento,
créditos, reloj, casos de soporte— para una transición que **no ocurre**. Un
superadministrador cree haber bajado a un cliente y el cliente sigue con todo.

Subir funciona (el rango mayor gana). Solo está roto el sentido descendente, que
es justo el que cuesta dinero.

### Por qué el esquema actual no lo arregla solo

El modelo es append-only a propósito, y su propio disparador lo dice: *«una
asignación no se reescribe: se cierra con `ends_at` y se abre otra»*. Nadie cierra
la anterior. Podría cerrarla la acción de TypeScript antes de llamar a la RPC,
pero eso pondría una invariante comercial en la capa de aplicación —cuando toda
PE-04 estableció que **la base es la autoridad**—, no sería atómico con la
inserción y no protegería a quien llame la RPC directamente: está concedida a
`authenticated` y la usan superadministradores.

### Qué haría falta

**Migración `0168`**, redefiniendo `commercial_assign_plan` para que, bajo el
candado de la empresa y en la misma transacción, **cierre las asignaciones
activas del mismo alcance** (`ends_at = starts_at` de la nueva) antes de insertar,
y lo deje registrado en el evento comercial.

Riesgo: bajo y acotado. Es una redefinición de función —no toca datos—, la
inserción y el cierre quedan en una transacción, y `plan_assignment_is_append_only`
ya permite cerrar un periodo cuyo fin aún no ha llegado. Hay que decidir
explícitamente si se cierran solo las del mismo alcance (recomendado) o también
las de módulo cuando la nueva es de empresa.

**Creada y aplicada tras autorización explícita.** El detalle completo —qué
compite, qué no se toca y por qué, el segundo defecto de reloj que apareció al
probarlo, la invariante en el esquema y la normalización de datos— está en
[`PE_04B6_PLAN_TRANSITION_FIX.md`](PE_04B6_PLAN_TRANSITION_FIX.md).

La comprobación que lo descubrió (`pe04b6-lifecycle · S1`) **no se relajó**:
pasa con el comportamiento real.

## Lo que sí quedó cerrado

### Ninguna autoridad comercial legacy en ejecución

Quedaban dos lectores del catálogo heredado con **autoridad**; los dos se
cerraron en este tramo:

- `checkModuleFeatureEnabled` resolvía `imports_enabled` traduciendo el
  `access_mode` del módulo a un plan legacy. Ahora usa `plan_effective_for_module`
  y el catálogo canónico — donde ese recurso ya estaba declarado con
  `scope = module` desde 0162.
- `getModuleEntitlements` hacía lo mismo y **no la llamaba nadie**: retirada.

Lo que sobrevive del catálogo heredado, clasificado:

| Fichero | Clase |
|---|---|
| `lib/db/plans.ts` | **presentación** · alimenta las tarjetas de uso heredadas del panel de PCR y la consola. Ninguna escritura cuelga de ella |
| `lib/db/plan-shadow.ts` | **diagnóstico** · la comparación de PE-04B1; solo la usa `scripts/pe04b1/sombra.ts` |

Y los dos puentes de traducción siguen retirados, sin un solo llamante.

### «Demo» dejó de ser el nombre del plan gratuito

Un hallazgo de este tramo: el panel de PCR y el onboarding mostraban **«Estás
usando el plan Demo»**, y lo decidían con `organization_subscriptions.plan_code`.
Un cliente Full cuya fila heredada dijera `demo` lo leía en su propia pantalla:
es el defecto que PE-04B2 cerró en la consola y que sobrevivía en la del cliente.

Ahora el aviso se decide con el **nivel comercial canónico**, se llama **Free**,
y `null` —«no se pudo determinar»— no pinta nada. El tope por archivo de
TrazaDocs también dice «plan Free».

«Demo» solo sobrevive en la consola de plataforma describiendo el **modo de
acceso** del eje de módulos (0100), donde es diagnóstico interno y no una oferta.

### Precios y fronteras

Free 0 · Full USD 40 / 400 · Extra USD 100 / 1 000, en unidades menores y
**antes de impuestos**, sembrados en 0162/0163. No hay plan `advisor` ni `asesor`,
no hay motor de horas, y no hay cobro, cupones ni cálculo de IVA en ningún sitio
de PE-04.
