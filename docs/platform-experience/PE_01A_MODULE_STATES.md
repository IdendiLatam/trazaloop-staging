# PE-01A · ESTADOS DE MÓDULO

Los estados **ya existen**. Este documento dice cómo se presentan y qué falta.

---

## 1 · Los nueve, tal como los resuelve el servidor

`lib/modules/access.ts` · `resolveModuleAccess()` con la hora del servidor.

| Estado | ¿Entra? | Etiqueta hoy | Etiqueta propuesta | Qué se explica |
|---|---|---|---|---|
| `full` | sí | Plan Full | **Activo** | acceso completo |
| `extra` | sí | Plan Extra | **Activo · almacenamiento ampliado** | — |
| `demo_permanent` | sí | Demo permanente | **Acceso de prueba** | sin fecha de vencimiento |
| `demo_active` | sí | Demo | **Prueba · quedan N días** | vence el … |
| `demo_expired` | no | Prueba finalizada | **Prueba finalizada** | tus datos se conservan |
| `not_assigned` | no | Sin asignar | **No incluido** | no forma parte de tu acceso |
| `disabled` | no | Módulo deshabilitado | **Acceso suspendido** | los datos se conservan |
| `globally_disabled` | no | Temporalmente no disponible | **Temporalmente no disponible** | no depende de tu empresa |
| `coming_soon` | no | Próximamente | **Próximamente** | todavía no existe |

**Por qué cambian cuatro etiquetas.**

- «Plan Full» y «Plan Extra» mezclan **acceso** con **plan comercial**. La tarjeta responde
  «¿puedo entrar?»; el plan es de PE-04. Y `full`/`extra` son modos **por módulo**, no el
  plan de la empresa: llamarlos «plan» ya confunde hoy.
- «Sin asignar» es vocabulario de administración. Quien lo lee no sabe si es un error suyo.
- «Módulo deshabilitado» no dice **quién** lo deshabilitó ni si se pierde algo.

**Lo que NO cambia:** los valores internos, la regla de resolución y `isEnterableState()`.
Solo la palabra que se lee.

---

## 2 · El estado que falta, y es el importante

### `unavailable` · no se pudo comprobar

Hoy **no existe**, y por eso un fallo de lectura se presenta como `not_assigned`
—«no está asignado a la empresa»— que es una afirmación **comercial** sobre un hecho
**técnico**.

| | ¿Entra? | Qué se ve |
|---|---|---|
| `unavailable` | no | «No fue posible comprobar tu acceso a este módulo.» + reintentar |

**Tres cosas que no se pueden confundir**, y hoy dos se confunden:

```
no lo tienes        ≠   no se pudo comprobar   ≠   todavía cargando
(decisión comercial)    (fallo técnico)             (nada que decir aún)
```

Cambio necesario: `getOrganizationModuleAssignment` deja de descartar el `error` y devuelve
una tercera respuesta. **Es la única corrección de comportamiento que PE-01B necesita
además de la presentación.**

---

## 3 · Estado de carga

Hoy no hay: la página es un componente de servidor y se pinta entera. Con la lectura por
módulo separada, la Home puede pintar el bloque de Quality en cuanto lo sepa.

**Regla:** mientras se carga, **esqueleto**. Nunca un estado por defecto, nunca una tarjeta
«activa» optimista, y nunca PCR de relleno.

---

## 4 · Empresa sin ningún módulo entrable

`hasEnterableModule` ya se calcula y **nadie lo usa**. Se usará:

> **Tu cuenta está activa y no tienes ningún módulo disponible ahora mismo.**
> Tus datos se conservan. Aquí abajo están los módulos de Trazaloop y el estado de cada
> uno.

Sin bucle de redirección —hoy tampoco lo hay— y sin cul-de-sac: se ve el catálogo completo
con su estado, y PE-05 pondrá la salida comercial.

---

## 5 · Plan gratuito · qué hará falta en PE-04

**Demo ≠ Gratis**, y hoy se solapan en el mismo valor:

| | Demo | Gratuito (futuro) |
|---|---|---|
| duración | 48 h | permanente |
| vence | sí | no |
| límites | los de `demo` | los suyos, por definir |
| tras vencer | `demo_expired` | no aplica |
| suelo | sí, cuando no queda nada vivo | no |

`organization_effective_plan_code` devuelve `demo` como **suelo**: una empresa con todo
vencido «es Demo». Correcto para la función, **engañoso para una pantalla** — es el origen
del síntoma «empresa Full que se ve como Plan Demo · 0 MB / 50 MB».

**PE-01 no depende de ese dato** —el selector resuelve por `derivedState` de cada módulo, no
por plan— así que la deuda **no bloquea**. Se documenta y se deja a PE-04, como pide §20 del
encargo. Arreglarla aquí sería tocar el modelo comercial de tapadillo.

---

## 6 · Kill switch

`globally_disabled` es de la instalación, no de la empresa, y el texto ya lo dice bien: «no
está disponible por el momento». **No se toca.** La única mejora es no confundirlo con
`disabled`, que sí es de la empresa.

---

## 7 · Cómo se comunica cada estado

Tres reglas:

1. **Nunca solo con color.** Cada estado lleva su palabra.
2. **Nunca «Entrar» donde no se puede entrar.** Ni deshabilitado ni gris: no está.
3. **Cada bloqueo dice qué pasa con los datos.** «Tus datos se conservan» es la primera
   pregunta de quien ve una prueba vencida, y ya está escrita en
   `DERIVED_STATE_HINT.demo_expired`.
