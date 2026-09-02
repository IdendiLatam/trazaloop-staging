# PE-04B6 · 0168 · Una transición que de verdad transiciona

## La causa

`commercial_assign_plan` (0167) **insertaba** la asignación nueva y no cerraba la
anterior. El resolutor toma la de mayor rango entre las activas, así que asignar
Full a una empresa con Extra la dejaba en Extra:

```
asignar extra → ok → plan efectivo: extra
asignar full  → ok → plan efectivo: extra
```

Subir funcionaba por casualidad —el rango mayor gana—; solo estaba roto el
sentido que cuesta dinero. Y la consola de PE-04B5 ofrece esa transición como
única vía, enseñando un aviso de impacto para algo que no ocurría.

El propio disparador de la tabla ya decía qué faltaba: *«una asignación no se
reescribe: se cierra con `ends_at` y se abre otra»*. Nadie cerraba la anterior.

## Qué compite exactamente

Cerrar **todo** lo del mismo alcance habría roto el modelo. La arquitectura de
PE-04B2 es **suelo + sobrecapas**:

| `grant_kind` | Qué es | ¿Se cierra? |
|---|---|---|
| `base` | el suelo Free permanente de cada módulo | **no** |
| `trial` | concesión temporal con su propio fin | **no** |
| `sold` · `courtesy` | la concesión comercial permanente | **sí** |

**El suelo no se toca** porque es lo que hace que una prueba caducada —o una
venta retirada mañana— caiga a Free en vez de a la nada, y «sin plan» **niega**.
**Las pruebas tampoco**: caducan solas, y quien recibió 48 horas de Full las
recibió; una transición comercial no las cancela.

Y compite solo lo del **mismo alcance**: misma empresa, mismo `scope`, mismo
`module_code`. Bajar PCR no toca Quality — probado.

## Cuándo se cierra

En el **instante efectivo de la nueva**: `ends_at = starts_at` de la que entra.
Sin solape y sin hueco — una prueba recorre los seis tramos que dejan cinco
transiciones y comprueba que cada uno termina exactamente donde empieza el
siguiente.

Para una transición **futura**, la anterior sigue vigente hasta esa fecha, que es
justo lo que se quiso programar. Y si ya hay una programada, una segunda
transición **se rechaza** (`ASSIGNMENT_CONFLICTS_WITH_FUTURE`) en vez de adivinar
qué quiso decir quien la lanzó.

Lo que compite es lo **activo**, no solo lo abierto: una concesión con fin en el
futuro sigue mandando hoy, y dejarla fuera del cierre haría que conviviera con la
nueva.

## Un segundo defecto, encontrado al probar el primero

La acción enviaba `p_starts_at: new Date().toISOString()`. Eso ataba la
transición al reloj del proceso de la aplicación: si iba unos milisegundos por
delante del de Postgres, la asignación nueva quedaba en el futuro, la anterior se
cerraba en ese mismo instante futuro, y durante ese rato **el plan efectivo
seguía siendo el viejo**.

Una transición que tarda en aplicarse por una diferencia de relojes es una
transición que a veces no se aplica. Ahora la acción manda `null` y el instante
lo sella **la base**.

## La invariante, en el esquema

```sql
create unique index opa_una_permanente_abierta
  on organization_plan_assignments (organization_id, scope, coalesce(module_code, ''))
  where ends_at is null and grant_kind in ('sold', 'courtesy');
```

Convierte el defecto en **imposible**, no solo en corregido: aunque alguien
llamara a la función equivocada o insertara a mano, la base se niega — probado.
El suelo y las pruebas quedan fuera del índice a propósito: son sobrecapas
legítimas que conviven con la venta.

## Atomicidad, concurrencia e idempotencia

Cierre e inserción ocurren en **una transacción**, bajo `pg_advisory_xact_lock`
por empresa. Dos transiciones simultáneas dejan **una** permanente abierta —
probado con `Promise.all`. Y reintentar la misma transición devuelve la misma
asignación con `already_applied: true` en vez de abrir otro periodo.

## Datos existentes

Local no tenía ninguna asignación permanente solapada (0 empresas al inspeccionar
y 0 grupos con más de una abierta). Aun así, 0168 incluye una **normalización
determinista e idempotente**: donde hubiera varias permanentes abiertas en el
mismo alcance, conserva la **más reciente** —que es la que alguien quiso que
valiera— y cierra las anteriores en el instante en que empezó la que las
sustituyó. **No borra ni una fila.** Es un no-op donde no hubo defecto, y por eso
puede viajar a Staging sin decisión humana previa.

Staging no se pudo inspeccionar sin credenciales de base, y no se buscaron. La
normalización está escrita para ser segura precisamente en ese caso.

## Lo que la bajada NO reinicia

Probado en las dos suites: bajar cambia el **techo**, nunca la **historia**.

| Al bajar de Extra a Full | |
|---|---|
| 2 GiB almacenados | `OVER_LIMIT`, **sin borrar nada** |
| 800 créditos consumidos | techo 500, consumo sigue en 800, `OVER_LIMIT`, no hay ejecuciones nuevas |
| 2 casos de soporte usados | sin orientación funcional; los tickets siguen; volver a Extra el mismo mes deja **2/2** |

## Una limitación conocida

`commercial_assign_plan` no reabre una asignación que quedó cerrada en el futuro
si alguien retira esa transición programada **por fuera del producto** (borrando
la fila a mano). En el producto no hay forma de hacerlo: la única vía es
programar otra transición, y ahí el rechazo por conflicto guía la decisión. Queda
dicho por si algún día se añade una pantalla para cancelar transiciones
programadas.
