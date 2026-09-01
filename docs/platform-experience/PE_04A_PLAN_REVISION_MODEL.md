# PE-04A · Catálogo, revisiones y asignación

Cómo se guarda un plan de forma que su pasado no se reescriba cuando cambie su
precio.

---

## 1 · El problema, con números

Hoy `plan_definitions` se edita **en sitio**. Si mañana Full pasa de 500 MB a
1 GB, o de USD 40 a USD 45, la fila cambia y **el pasado desaparece**: no hay
forma de responder «¿bajo qué condiciones contrató esta empresa en marzo?».

Trazaloop ya resolvió exactamente este problema tres veces —documentos legales
(0136), FAQ (0155), tutoriales (0159)— siempre con la misma forma:

> **identidad estable + revisiones inmutables + rangos de vigencia.**

No hace falta inventar nada. Hace falta aplicarlo.

---

## 2 · La forma propuesta

```
plans                        identidad · code, status, display_order
  └─ plan_revisions          INMUTABLE una vez publicada
        · name, description          ← lo que ve el cliente
        · monthly_price_cents        ← ANTES de impuestos
        · annual_price_cents
        · currency
        · storage_limit_bytes
        · ai_allowance
        · daily_use_policy
        · support_entitlement
        · effective_from / effective_to
        · published_at / published_by

organization_plan_assignments      qué tiene cada empresa
        · organization_id
        · plan_revision_id           ← la revisión CONCRETA que contrató
        · grant_kind: default|trial|sold|courtesy
        · module_code                ← si la asignación es por módulo
        · effective_from / effective_to
        · assigned_by, reason
```

Tres reglas heredadas de lo que ya funciona:

**La identidad no cambia.** `free`, `full`, `extra` son códigos estables. El
nombre visible vive en la revisión y puede cambiar mañana.

**Una revisión publicada no se toca.** Cambiar un precio crea una revisión
nueva; la anterior se cierra con su `effective_to`. Igual que 0136 con las
políticas de privacidad.

**La empresa apunta a una revisión, no a un código.** Ahí está la verdad
histórica: quien contrató bajo la revisión 3 sigue apuntando a la revisión 3
hasta que alguien lo mueva, y se puede responder qué le prometimos.

> **PEC-01.** Identidad estable en `plans`.
> **PEC-02.** Revisiones inmutables con vigencia en `plan_revisions`.
> **PEC-03.** La asignación apunta a una **revisión**, no a un código.

---

## 3 · Borrador, publicar, retirar

Igual que la FAQ y los documentos legales, y por el mismo motivo: **editar un
borrador no puede cambiar lo que hay publicado.**

```
borrador  →  vista previa  →  PUBLICAR  →  vigente  →  (siguiente revisión la cierra)
```

Una función `plan_publish_revision()` que en una transacción cierre la anterior,
abra la nueva, las enlace y deje constancia de quién publicó. Nunca cuatro
`update` sueltos: es la lección de `legal_publish_document`.

> **PEC-16.** Publicar es una primitiva. Ningún camino escribe
> `effective_to` a mano.

### ¿Hace falta publicar con efecto futuro?

**No al principio.** Un `effective_from` en el futuro obliga a un planificador o
a que toda lectura filtre por fecha, y no hay caso comercial que lo pida hoy.

Basta con que la revisión sea efectiva al publicarla. La columna `effective_from`
existe igual —es la que da la historia—, simplemente se rellena con `now()`.

> **PEC-17.** Vigencia desde la publicación. Sin programación diferida hasta que
> exista un caso comercial que la exija.

---

## 4 · Precio y capacidad son cosas distintas

Es la separación que hace posible PE-05 sin duplicar planes.

| | Qué es | Dónde vive |
|---|---|---|
| **Precio** | Cuánto cuesta | `plan_revisions.*_price_cents` |
| **Capacidad** | Qué se puede hacer y hasta dónde | `plan_revisions.*_limit` / `*_allowance` |

Un cupón, un descuento anual o una tarifa de gremio **cambian el precio y no
tocan la capacidad**. Sin esta separación haría falta un «Full con 20 % para la
cámara de comercio», y a los seis meses habría catorce planes que son el mismo.

> **PEC-13.** El descuento se aplica sobre el precio de una revisión. **Jamás**
> crea un plan.

### Impuestos

Los precios se guardan **antes de impuestos**, y la columna tiene que decirlo en
su nombre y en su comentario. Ni el catálogo ni ninguna pantalla de PE-04 puede
afirmar «USD 40 finales». El cálculo del impuesto es de PE-05.

> **PEC-18.** `monthly_price_cents` es **sin impuestos**, y se documenta en el
> `comment on column`. En céntimos enteros: nunca coma flotante para dinero.

---

## 5 · Público e interno

PE-05 va a exponer precios en una página pública. La revisión tiene que
distinguir qué se puede enseñar:

| Público | Interno |
|---|---|
| `name`, `description` | Techos de coste de IA |
| `monthly_price_cents`, `annual_price_cents` | Notas operativas |
| Límites que el cliente entiende (GB, consultas/mes) | Márgenes, contadores de tokens |
| Qué incluye el soporte | Umbrales de alerta interna |

La forma más simple y difícil de estropear: **una vista pública** con las
columnas visibles, `security_invoker`, legible por `anon`, y la tabla base
cerrada a `platform_staff`.

Nunca «no lo enseñamos en el frontend»: eso es una decisión de pantalla, y
PostgREST expone la tabla.

> **PEC-19.** Los campos públicos salen por una **vista pública explícita**. La
> tabla base no se concede nunca a `anon`.

---

## 6 · Asignación, y qué pasa al subir o bajar

**Subir** tiene que ser inmediato y sin migración de datos: se cierra la
asignación actual, se abre la nueva apuntando a la revisión del plan superior, y
el resolutor devuelve otra cosa en la siguiente consulta. No hay nada que copiar.

**Bajar** conserva todo. Ver
[PE_04A_STORAGE_USAGE_ARCHITECTURE.md](PE_04A_STORAGE_USAGE_ARCHITECTURE.md) §6:
los datos se quedan, lo nuevo se bloquea, y estar por encima del límite es un
estado legítimo que se muestra.

**La historia se conserva sola**: las asignaciones cerradas siguen ahí con sus
fechas, su motivo y quién las hizo. `subscription_plan_history` deja de ser una
tabla aparte y pasa a ser lo que se lee de las asignaciones — aunque conviene
**conservar la tabla existente** con lo que ya tiene: es historia real.

> **PEC-11.** Bajar de plan **nunca** borra datos.
> **PEC-12.** La historia comercial se lee de las asignaciones cerradas, no de
> un registro de auditoría.

---

## 7 · Estados de suscripción

Hoy: `active`, `suspended`, `cancelled`, en `organization_subscriptions.status`,
y solo `suspended`/`cancelled` siguen teniendo efecto (bloqueo transversal de
escritura).

Para PE-04 hace falta **poco**, y conviene no inventar estados de pago antes de
que exista pago:

| Estado | Hace falta en PE-04 | Por qué |
|---|---|---|
| `active` | **Sí** | |
| `suspended` | **Sí** | Ya existe y ya bloquea |
| `cancelled` | **Sí** | Ya existe |
| `trialing` | **No** | Lo dice `grant_kind='trial'` con su vigencia |
| `past_due`, `grace`, `incomplete` | **No** | Son del proveedor de pagos. **PE-05** |

> **PEC-20.** PE-04 conserva los tres estados que ya existen. Los estados de
> cobro los introduce PE-05, con su proveedor.

**Free no necesita pago.** Una empresa en Free no tiene cliente en ninguna
pasarela, no tiene método de pago y funciona entera. El resolutor de
entitlements no puede depender de nada de PE-05.

---

## 8 · Overrides

Hoy existen, y de dos formas distintas: `intelligence_limit_overrides` —con
`reason`, vigencia y revocación, que es la forma correcta— y el
`access_mode` puesto a mano por un superadministrador con
`assignment_source='superadmin'`, que también deja rastro.

La recomendación es unificar en el segundo patrón: un override **es** una
asignación con `grant_kind='courtesy'`, su motivo y su vigencia. Explícito,
auditable y con fecha de caducidad — no un valor suelto que nadie sabe por qué
está ahí.

> **PEC-21.** Toda excepción es una asignación con motivo y vigencia. No existe
> la excepción silenciosa.
