# PE-04B1 · El catálogo canónico

Migración **0162**. Identidad estable, revisiones inmutables y un catálogo de
recursos con vocabulario cerrado.

> **Esta migración no cambia el comportamiento de ninguna empresa.** Ni una. El
> modelo vive en paralelo al de hoy; cambiar la autoridad es PE-04B2.

---

## 1 · Tres planes, y ninguno más

| Código | Estado | Por qué |
|---|---|---|
| `free` | activo | El suelo **permanente**. No caduca |
| `full` | activo | El producto completo |
| `extra` | activo | Como Full, con más almacenamiento y acompañamiento |

Y dos que **no** están, cada uno por su motivo.

**`demo` no es un plan.** En el modelo de hoy significa cuatro cosas a la vez:
una ventana de prueba de 48 horas por módulo, el suelo al que cae todo, una fila
de catálogo con sus límites, y un estado de bloqueo (`demo_expired`). Cuatro
significados en una palabra es la raíz del lío que PE-04A documentó. Aquí la
prueba es una **concesión temporal de un plan de pago** y el suelo es `free`.

**`advisor` no es un plan.** Es un servicio, y se combina con cualquier plan
—«Full + Asesor» y «Extra + Asesor» son dos ofertas reales—, así que como cuarto
plan obligaría a mantener las combinaciones a mano. Se modelará como complemento
cuando toque; B1 no lo implementa.

La restricción de la base admite exactamente los tres. Intentar crear `demo` o
`advisor` falla, y hay prueba de las dos.

---

## 2 · La identidad no lleva nada que cambie

```sql
plans (code, status, display_order, created_at)
```

Ni precio, ni cuota, ni nombre visible, ni descripción. Todo eso cambia, y por
eso vive en las revisiones. Una prueba comprueba que la tabla de identidad no ha
ganado ninguna de esas columnas.

El nombre visible sale de la revisión vigente. Hoy `lib/plans/types.ts` tiene un
mapa `PLAN_LABEL` en el código; el modelo nuevo lo pone en la base, que es donde
un superadministrador puede tocarlo.

---

## 3 · El catálogo de recursos

Vocabulario **cerrado**, como las claves de pantalla y las de módulo. Un recurso
mal escrito que se guarda en silencio es un límite que nadie aplica nunca.

| Recurso | Unidad | Ámbito |
|---|---|---|
| `storage_bytes` | bytes | **empresa** |
| `documents_trazadocs`, `suppliers`, `materials`, `products`, `evidences`, `production_orders`, `input_batches`, `output_batches` | conteo | módulo |
| `team_members` | conteo | empresa |
| `roles_enabled`, `imports_enabled`, `diagnostic_recommendations_enabled` | sí/no | empresa · módulo |
| `ai_runs_per_month` | consultas/mes | empresa |
| `daily_metered_operations` | operaciones/día | empresa |
| `technical_report_enabled`, `functional_support_enabled` | sí/no | empresa |

`storage_bytes` es **de la empresa** por decisión congelada del propietario del
producto: una sola cuota, venga el archivo de Quality, de PCR o de Textiles.
Difiere de lo que hace hoy el modelo legacy, donde la cuota se aplica por módulo
— y el cambio es de B3.

`unit` no es decoración: dice cómo se enseña. «40 consultas al mes» se entiende;
«40» no.

---

## 4 · Los valores, COPIADOS

Ningún número se inventó. La siembra los lee del catálogo de hoy con una
subconsulta:

```sql
join (values ('free','demo'), ('full','full'), ('extra','extra')) as mapa(nuevo, legacy)
join public.plan_limits pl on pl.plan_code = mapa.legacy
```

Escribirlos a mano desde las etiquetas —«50 MB»— habría sido **recalcular**, y
recalcular es como se cambia un número sin querer.

| Plan | Almacenamiento | Verificado contra |
|---|---|---|
| `free` | **52 428 800** | `plan_definitions('demo')` |
| `full` | **524 288 000** | `plan_definitions('full')` |
| `extra` | **5 368 709 120** | `plan_definitions('extra')` |

Y los trece límites funcionales se copian igual, uno a uno. Una prueba recorre
**todos** los del catálogo viejo y comprueba que ninguno se perdió y que
`is_unlimited` se tradujo a `unlimited`.

Son semillas **seguras para migrar**, no promesas comerciales para siempre: el
propietario del producto las editará publicando revisiones.

---

## 5 · Un límite vive en UN sitio

Hoy la cuota de almacenamiento está **dos veces**:
`plan_definitions.storage_limit_bytes` y `plan_limits('storage_bytes')`. Los
valores coinciden por casualidad, y nada lo garantiza.

En el modelo nuevo hay **una** tabla de límites y **ninguna columna de cuota en
la revisión**. Una prueba lo comprueba leyendo las columnas de `plan_revisions`
y exigiendo que ninguna se llame `storage`, `limit` ni `quota`.

---

## 6 · Tres estados, y el tercero es el que importa

```sql
limit_state check (limit_state in ('finite', 'unlimited', 'not_configured'))
limit_value bigint
check ((limit_state = 'finite') = (limit_value is not null))
```

| Estado | Qué significa | Qué hace quien lo lee |
|---|---|---|
| `finite` | Hay un número | Compara |
| `unlimited` | Sin tope de producto | Concede |
| `not_configured` | **Todavía no se ha decidido** | **DENIEGA** |

El tercero existe porque B1 tiene que poder decir «esto aún no se ha decidido»
sin inventarse una cifra ni regalar barra libre. La IA y el uso diario nacen así
en los tres planes, y hay dos razones:

- el propietario del producto congeló que Free **incluirá** algo de IA y **no**
  congeló cuánto;
- hoy existen dos motores de límites de IA con **dos techos mensuales distintos**
  —10 000 y 500— que nadie concilia. Ponerle un número al plan antes de
  reconciliar eso sería añadir un tercero.

Y la forma de la restricción impide un nulo suelto que alguien lea como
«ilimitado»: el valor existe **exactamente** cuando el estado es `finite`.

---

## 7 · La política de prueba, fuera de la función

Hoy las 48 horas están escritas **dentro** de
`provision_new_organization_modules`. Es el peor sitio posible para un parámetro
comercial: cambiarlo exige una migración y el propietario del producto no puede
tocarlo.

```sql
commercial_trial_policy (id, enabled, trial_plan_code, trial_duration_hours)
```

Fila única, sembrada con lo que hace hoy el producto: **Full durante 48 horas**.
Un superadministrador puede cambiarla sin migración.

**B1 no cambia todavía la creación de empresas.** La política está ahí y nadie la
lee: conectarla es B2.

---

## 8 · Idempotencia, y una trampa que costó descubrir

Los límites se insertan con `where not exists`, **no solo con `on conflict do
nothing`**.

`on conflict` resuelve el conflicto **después** de ejecutar los disparadores
`before insert`, así que una segunda pasada sobre una revisión ya publicada
choca contra el disparador de inmutabilidad —correctamente, porque desde su
punto de vista alguien está tocando los límites de algo publicado— y aborta.

Comprobado ejecutando la siembra dos veces: con `on conflict` solo, falla; con
`where not exists`, la fila duplicada ni se intenta.
