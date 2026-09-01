# PE-04B2 · El cambio de autoridad

Un solo punto, y por eso cambia la respuesta en todo el producto a la vez.

---

## 1 · La función que todo el mundo pregunta

`organization_effective_plan_code(org)` es por donde el producto entero pregunta
«¿qué plan tiene esta empresa?». Redefinirla cambia la respuesta en todas partes
simultáneamente — que es exactamente lo que se quiere: **una sola verdad**.

```
antes:  los módulos → y si no hay filas, organization_subscriptions.plan_code
                      y si nada → 'demo'

ahora:  plan_effective_for_organization()  → free | full | extra
                      y si no hay asignación → 'free'
```

**La reserva legacy desaparece.** Esa fila es la que produce el «Plan Demo ·
50 MB» de una empresa Full, y seguir leyéndola dejaría el defecto vivo en el
único sitio donde nadie lo miraría.

Y devuelve `free` donde antes devolvía `demo`: el suelo dejó de ser una prueba
caducada y pasó a ser un plan.

---

## 2 · Un fallo no es un plan

La otra mitad del defecto, y la que costó más ver.

```ts
// antes
if (error) return "demo";
```

Fallaba cerrado —bien— y a la vez **mentía sobre la identidad del plan**: no
distinguía «es el plan más bajo» de «no pude saberlo». Un cliente Full con un
error de lectura leía «Plan Demo», indistinguible de una empresa que de verdad
está en el suelo.

```ts
// ahora
if (error) return null;   // «no se pudo determinar»
```

Y quien llama **deniega**, con su propio mensaje:

> No se pudo comprobar el plan de tu empresa ahora mismo. Vuelve a intentarlo en
> un momento.

No dice «tu plan no lo permite» —eso sería mentir sobre lo que la empresa
tiene— y no deja pasar. Mismo criterio que `RESOURCE_USAGE_UNVERIFIABLE`, que ya
existía en este repositorio.

El tipo lo hace difícil de olvidar: `Promise<CommercialTier | null>`. TypeScript
señaló los siete sitios que antes recibían «demo» en silencio.

---

## 3 · Lo que se movió, y lo que no

| | Autoridad ahora | Tramo |
|---|---|---|
| **Plan comercial** (display, resolutores) | **canónico** | ✅ B2 |
| Cuota que se **enseña** | **canónico** | ✅ B2 |
| Cuota que se **aplica** en la subida | legacy `plan_definitions` | **B3** |
| Límites de conteo | legacy `plan_limits` | **B3** |
| Acceso al módulo (presencia, bloqueo) | legacy `organization_modules` | **B4** |
| Créditos de IA | no se aplican | **B4** |
| Minutos activos | no se aplican | **B4** |
| Casos de acompañamiento | no se aplican | **B5** |

### Por qué el seam está ahí

Los valores legacy y los canónicos **coinciden por construcción** para cada
empresa migrada: `demo`↔`free`, `full`↔`full`, `extra`↔`extra`, porque la
migración deriva de los primeros. Así que durante B2 no hay ninguna empresa que
reciba unos límites y otro plan.

---

## 4 · El puente temporal, y cuándo se retira

```ts
commercialTierToLegacyPlanCode(tier)   //  free → demo
```

`plan_limits` y `plan_definitions` llaman `demo` al plan más bajo; el canónico lo
llama `free`. La traducción es **exacta, no aproximada**: los límites de Free se
copiaron de los de `demo` byte a byte en 0162, y hay prueba comparando las dos
tablas.

**Se retira en PE-04B3**, cuando los límites pasen a leerse de
`plan_revision_limits`. Está escrito en el propio comentario de la función, y una
prueba comprueba que ese comentario nombra el tramo — porque un puente sin fecha
de retirada es un puente permanente.

Es la única compatibilidad que queda, y es de **lectura**: no hay ninguna
escritura doble, ni ningún disparador que sincronice los dos modelos.

---

## 5 · Lo que ve la consola

| | Antes | Ahora |
|---|---|---|
| Plan | «Demo» (de la fila legacy o de un fallo) | El **canónico** |
| Si no se pudo determinar | «Demo» | **«No se pudo determinar»** |
| La fila legacy | «Plan heredado (histórico / administrativo)» | **«LEGACY · no autoritativo»** |
| Cuota | 50 MB del plan legacy | La canónica, vía `organization_commercial_storage_bytes` |

El rótulo viejo era cierto y suave. Quien lo leía seguía viendo dos planes y no
sabía cuál creerse. Ahora lo dice sin rodeos, y hay prueba de que el suave no
vuelve.

---

## 6 · Y las tablas legacy siguen enteras

`plan_definitions`, `plan_limits`, `organization_subscriptions`,
`subscription_plan_history` y `organization_modules`: ni se borran, ni se
alteran, ni se reescriben. 0163 no tiene un solo `alter table` ni `drop column`
sobre ellas, y hay prueba.

Su `status` —`suspended`/`cancelled`— **sigue bloqueando** escrituras. Es un eje
distinto del plan y sobrevive intacto.
