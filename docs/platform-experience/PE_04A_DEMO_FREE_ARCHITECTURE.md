# PE-04A · Demo y Free no son lo mismo

El encargo pide no fundirlos hasta entender su ciclo de vida. Entendido, son
cosas distintas — y hoy comparten la misma palabra, que es la raíz del lío.

---

## 1 · «Demo» significa dos cosas a la vez

En el repositorio de hoy, `demo` es:

| | |
|---|---|
| **Una ventana de prueba** | 48 horas, por módulo, automática al crear la empresa, con `access_expires_at` |
| **El suelo del plan** | Lo que devuelve `organization_effective_plan_code()` cuando no hay nada vigente |
| **Una fila de catálogo** | `plan_definitions('demo')` con 50 MB y trece límites de conteo |
| **Un estado de bloqueo** | `reason = 'demo_expired'` bloquea escrituras en el módulo |

Una sola palabra para «te estamos dejando probar», «no tienes nada contratado» y
«se te acabó». Son tres situaciones comerciales distintas y hoy se ven igual.

---

## 2 · Lo que Demo hace hoy, medido

| | |
|---|---|
| Duración | **48 horas** desde la creación de la empresa |
| Disparador | Automático · `provision_new_organization_modules` |
| Ámbito | **Por módulo funcional.** `core` nace en `full` para siempre |
| Al vencer | El módulo bloquea escrituras · `demo_expired` |
| Los datos | **Sobreviven.** No hay borrado, no hay cron |
| Lectura tras vencer | La cuenta entra; el módulo no deja crear |
| Cuota | 50 MB · trece límites de conteo muy estrechos (1 proveedor, 1 lote…) |
| IA | **Sin relación con el plan.** Un Demo tiene los mismos límites que un Full |
| Conversión | Manual: un superadministrador sube el `access_mode` del módulo |
| Ámbito de la decisión | **Empresa**, nunca persona |

Cuarenta y ocho horas es una prueba, no un plan. Nadie evalúa un sistema de
gestión de calidad en dos días.

---

## 3 · Lo que Free tiene que ser

| | DEMO / prueba | FREE / plan |
|---|---|---|
| Naturaleza | Ventana **temporal** | Plan **persistente** |
| Caduca | Sí | **No** |
| Se concede | Automático o por decisión comercial | Es el estado por defecto |
| Al terminar | Cae a algo | No termina |
| Límites | Muy estrechos, para probar | **Usables de verdad** |
| Requiere pago | No | No |

**Free no es Demo renombrado**, y el encargo lo dice. Demo existe para que
alguien *pruebe algo que no tiene*; Free existe para que alguien *use Trazaloop
indefinidamente dentro de unos límites*.

---

## 4 · La arquitectura recomendada: separar el eje

El error a evitar es meter Free como cuarto valor de `access_mode` y seguir
mezclando «qué plan» con «hasta cuándo». La forma limpia es reconocer que hoy ya
hay **dos ejes** metidos en una columna:

```
QUÉ tiene contratado          →  plan_code:  free · full · extra
DURANTE cuánto lo tiene       →  vigencia:   effective_from … effective_to
POR QUÉ lo tiene              →  grant_kind: default · trial · sold · courtesy
```

Con eso, «Demo» deja de ser un plan y pasa a ser **una concesión temporal de un
plan superior**:

| Situación | Hoy | Propuesto |
|---|---|---|
| Empresa nueva | `demo` 48 h | `free` **sin caducidad** + concesión `trial` de `full` por 48 h |
| Prueba vencida | `demo` bloqueado | La concesión caduca · **cae a `free`, que sigue funcionando** |
| Cliente que paga | `full` | `full` con `grant_kind='sold'` |
| Cortesía comercial | `full` a mano | `full` con `grant_kind='courtesy'` y motivo escrito |

**La mejora que más se nota:** hoy, al vencer la prueba, la empresa se queda
bloqueada. Con Free debajo, al vencer **cae a algo que funciona**. Es la
diferencia entre una puerta que se cierra y un escalón.

> **PEC-05.** `free` es un plan persistente. La prueba es una **concesión
> temporal de un plan superior**, no un plan. `demo` deja de ser código de plan
> y se convierte en `grant_kind = 'trial'`.

---

## 5 · Las preguntas del encargo, respondidas

**¿Puede una empresa Free recibir después una prueba de funciones de pago?**
Con este modelo, **sí y sin nada nuevo**: es una concesión `trial` de `full` con
vigencia. Al caducar vuelve a Free. Hoy sería imposible sin degradarla.

**¿Demo caduca a Free?** Con este modelo **no caduca a nada**: Free es el
suelo permanente y la concesión simplemente deja de aplicar. Es lo mismo que
hace `organization_effective_plan_code` cuando ignora un demo vencido, pero con
un suelo que sirve.

**¿Una empresa nueva empieza en Free o en Demo?** **Decisión humana**, y las dos
tienen defensa:

| | A favor | En contra |
|---|---|---|
| **Free solo** | Honesto, sin sorpresa a las 48 h | Nadie ve lo que no ha contratado; menos conversión |
| **Free + prueba de Full 48 h** | Se ve el producto entero, y al caducar queda algo usable | Hay que explicar bien qué pasa al terminar |
| **Free + prueba más larga** | 48 h no bastan para valorar un SGC | Decisión comercial, no técnica |

**Recomendación técnica:** Free por defecto **más** una concesión de prueba, con
la duración configurable — hoy son 48 horas *escritas en una función*, que es el
peor sitio para un parámetro comercial.

---

## 6 · Migración: qué pasa con lo que ya existe

Ninguna empresa se toca en PE-04A. Para B2:

| Estado hoy | Propuesto |
|---|---|
| Módulos en `demo` **vigente** | `free` + concesión `trial` de `full` con el `access_expires_at` que ya tiene |
| Módulos en `demo` **vencido** | `free`. **Gana acceso**, no lo pierde |
| Módulos en `full` / `extra` | Igual, con `grant_kind='sold'` salvo que haya prueba de otra cosa |
| `organization_subscriptions` en `demo` con módulos en Full | El módulo manda. La fila legacy se archiva, no se obedece |
| Sin filas de módulo (legacy) | `free`, y se anota para revisión |

**Nadie pierde acceso en la migración.** Una empresa con demo vencido hoy está
bloqueada; mañana estará en Free, que funciona. Eso es un cambio de producto
—hay que decirlo— y es la dirección correcta.

---

## 7 · Lo que Free conserva pase lo que pase

Congelado por el encargo, y hay que sostenerlo con una prueba:

- **La FAQ**, la **ayuda contextual** y los **tutoriales de pantalla**.
- Si se puede ver una pantalla, se puede ver su ayuda.

PE-03 ya lo cumple por construcción: ninguna acción de tutoriales ni de ayuda
consulta ningún plan, y hay pruebas que lo vigilan. **PE-04 no puede
introducirlo.**

> **PEC-06.** La autoayuda no es un derecho comercial. Ningún resolutor de
> entitlements se consulta para servir FAQ, ayuda o tutoriales.
