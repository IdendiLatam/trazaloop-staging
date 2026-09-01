# PE-04A · Lo que hay hoy, leído del repositorio

Antes de diseñar nada. Todo lo que sigue sale del esquema real y del código, no
de la documentación anterior.

---

## 1 · El inventario

### Tablas

| Tabla | Qué guarda |
|---|---|
| `plan_definitions` | Catálogo de planes. `code` ∈ **`demo` · `full` · `extra`**, `name`, `description`, `status`, **`storage_limit_bytes`** |
| `plan_limits` | Límite por `(plan_code, resource_code)` · 13 recursos · `limit_value` o `is_unlimited` |
| `organization_subscriptions` | **Una fila por empresa** (índice único). `plan_code`, `status` ∈ `active/suspended/cancelled`, `valid_until`, `assigned_by` |
| `subscription_plan_history` | `from_plan_code` → `to_plan_code`, `changed_by`, `change_reason` |
| `organization_modules` | **`access_mode`** ∈ `demo/full/extra` **por módulo**, `enabled`, `access_expires_at`, `assignment_source` |
| `modules` | Catálogo · `is_available`, `is_functional` |
| `intelligence_usage_limits` | Límites de IA **por empresa**: minuto/hora/mes/concurrencia |
| `intelligence_limit_overrides` | Excepciones con `reason`, `effective_from`, `expires_at`, `revoked_at` |
| `quality_ai_settings` | `monthly_run_limit` (500) y **`daily_user_limit`** (50) |
| `support_tickets` | Categoría, módulo, prioridad, estado, `first_response_target_at` |
| `storage_upload_intents` | Reservas de subida con TTL e idempotencia |

### Lo que NO existe

- **`free`** no existe como código de plan. El `check` admite tres.
- **`advisor` / `asesor`** no existe en ninguna forma.
- **Ningún precio.** Ni columna, ni tabla, ni constante en el frontend. Lo único
  en dólares del repositorio es la previsión de **coste** de IA en la consola
  interna (`/platform/intelligence`) — coste, no precio.
- **Ninguna revisión de plan.** `plan_definitions` se edita en sitio: cambiar el
  límite de Full reescribe el pasado.
- **Ningún cupón, ninguna facturación, ningún impuesto.**

---

## 2 · Cuatro fuentes que responden «¿qué plan tiene esta empresa?»

Y no todas dicen lo mismo.

| # | Fuente | Ámbito | Quién la usa |
|---|---|---|---|
| **1** | `organization_modules.access_mode` | **por módulo** | Acceso, límites de conteo, cuota de subida |
| **2** | `organization_effective_plan_code()` | org (derivada de 1) | «Plan efectivo» de la consola, recursos transversales |
| **3** | `organization_subscriptions.plan_code` | org | `v_organization_plan_usage`, estado administrativo |
| **4** | `plan_definitions` / `plan_limits` | catálogo | Los valores de todas las anteriores |

### La precedencia real, tal como está escrita

```
organization_modules.access_mode          ← AUTORIDAD (T9F.1)
      │
      ├─ resolve_organization_module_access()  → acceso y límites POR MÓDULO
      │
      └─ organization_effective_plan_code()    → el mejor de los módulos vigentes
                                                  extra > full > demo
                                                  y si no hay filas de módulo,
                                                  cae a organization_subscriptions

organization_subscriptions.status         ← bloqueo ADMINISTRATIVO transversal
                          .plan_code      ← LEGACY · no decide nada comercial
```

T9F.1 lo dejó escrito con todas las letras: *«organization_subscriptions (plan
legacy org-wide) NO participa en ninguna decisión comercial de estos módulos»*.

**Riesgo de deriva: alto y ya materializado.** Ver
[PE_04A_EXISTING_ORG_MIGRATION.md](PE_04A_EXISTING_ORG_MIGRATION.md) §1.

---

## 3 · `organization_effective_plan_code()`, línea a línea

```
¿hay filas de organization_modules para módulos funcionales?
  SÍ → el mejor access_mode entre los que están enabled Y vigentes
       (un demo con access_expires_at pasado no cuenta)
       rank: extra=3 > full=2 > demo=1
       si no queda ninguno vigente → 'demo'
  NO → organization_subscriptions.plan_code, si es demo/full/extra
       si no → 'demo'
```

| Caso | Resultado |
|---|---|
| Módulos en Full | `full` |
| Un módulo Extra y dos Full | `extra` |
| Demo vencido en todos | `demo` |
| Todos deshabilitados | `demo` |
| Sin filas de módulo (empresa legacy) | lo que diga la suscripción |
| Sin filas de nada | `demo` |
| Error de lectura en la capa TS | **`demo`** — falla cerrado |

**Nota sobre el suelo.** `demo` es a la vez «el plan más bajo» y «una ventana de
prueba de 48 horas». Esa doble carga es el nudo que PE-04 tiene que deshacer:
ver [PE_04A_DEMO_FREE_ARCHITECTURE.md](PE_04A_DEMO_FREE_ARCHITECTURE.md).

---

## 4 · Lo que se llama «Demo» hoy

Al crear una empresa, `provision_new_organization_modules`:

| Módulo | `access_mode` | Caduca | `assignment_source` |
|---|---|---|---|
| `core` | `full` | nunca | `infrastructure` |
| Cada módulo **funcional** | `demo` | **`now() + 48 horas`** | `auto_demo_trial` |

Y `create_organization` inserta además una fila en `organization_subscriptions`
con `plan_code = 'demo'`, que **nunca se sincroniza** con los módulos después.

Al vencer, `resolve_organization_module_access` devuelve
`allowed:false, reason:'demo_expired'` y el módulo bloquea escrituras. **Los
datos no se tocan**: no hay borrado, no hay cron, la hora la pone el servidor al
consultar.

Demo es, entonces:

- **por módulo**, no por empresa;
- una **ventana de 48 horas**, automática;
- también el **suelo** al que cae todo lo demás;
- **no** un plan comercial persistente;
- **no** relacionado con pago alguno.

---

## 5 · Módulos y plan son ortogonales, y ya lo son

`organization_modules` tiene `(module_code, access_mode)`: una empresa puede
tener **PCR en Full y Textiles en Demo** al mismo tiempo. Eso ya funciona, y los
límites que aplica el servidor son los del módulo, no los de la empresa.

Esto es una fortaleza del modelo actual y **PE-04 no debe romperlo** metiendo un
plan global por encima.

---

## 6 · Almacenamiento

Ver [PE_04A_STORAGE_USAGE_ARCHITECTURE.md](PE_04A_STORAGE_USAGE_ARCHITECTURE.md).
En resumen: hay **dos** resolutores de cuota, y no coinciden.

---

## 7 · Inteligencia

Ver [PE_04A_AI_USAGE_ARCHITECTURE.md](PE_04A_AI_USAGE_ARCHITECTURE.md).
En resumen: los límites de IA **no dependen del plan en absoluto**.

---

## 8 · Soporte

`support_tickets` existe y es completo: diez categorías —incluidas
`technical_support` y `bug`—, trece módulos, cuatro prioridades, seis estados,
asignación, mensajes, historial de estado y `first_response_target_at` calculado
por un disparador (`created_at + 1 día`, saltando sábado y domingo).

**El plan no interviene en ninguna parte.** No hay función de soporte que lea
`plan_code` ni `access_mode`. Cualquier empresa, en cualquier plan, puede abrir
cualquier categoría con cualquier prioridad.

---

## 9 · Nombres visibles y códigos

`lib/plans/types.ts` tiene `PLAN_LABEL = { demo: "Demo", full: "Full", extra:
"Extra" }` — un mapa de presentación en el código, alimentado por el código
estable. La separación entre clave e etiqueta ya está bien hecha; lo que falta
es que la **etiqueta y el precio** vivan en la base y no en el código.

`plan_definitions.name` y `.description` ya existen y **no se usan** en el
frontend: el mapa del código los pisa.
