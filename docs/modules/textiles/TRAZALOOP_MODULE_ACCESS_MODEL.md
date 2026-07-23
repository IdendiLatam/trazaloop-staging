# Trazaloop · Modelo de acceso por módulo

> Sprint T0.2 — Solo documentación. Analiza el modelo actual (código real CPR,
> sprint 10D) y propone la arquitectura futura de acceso por módulo. **Nada de este
> documento se implementa en T1**; la implementación pertenece al sprint futuro
> Plataforma-M1 (DL-22).

## 1. Objetivo

Que una empresa pueda tener **niveles de acceso distintos por módulo** (p. ej. CPR
Full + Textil Demo), gestionados por el superadministrador, con planes y límites por
módulo.

## 2. Modelo actual (análisis del código real)

| Objeto | Definición real | Limitación frente a la necesidad |
|---|---|---|
| `modules` (0004) | Catálogo global: `code` PK, `name`, `description`, `is_available`. | Suficiente como catálogo; solo faltarán filas nuevas (`textiles`, `quality`, `construction`). |
| `organization_modules` (0004) | Activación por empresa: `organization_id`, `module_code`, `enabled boolean`, `activated_at`; `unique(organization_id, module_code)`. | Es un interruptor: no expresa **plan**, **estado comercial**, quién activó, vencimiento ni límites por módulo. |
| `plan_definitions` (0050) | Planes `demo/full/extra` con `storage_limit_bytes`. | El plan se define bien, pero se asigna globalmente. |
| `plan_limits` (0050) | Límite por `(plan_code, resource_code)`; 13 recursos con check cerrado, todos de dominio CPR + transversales (`team_members`, `storage_bytes`…). | El check cerrado exige ampliación aditiva para recursos textiles; los límites no distinguen módulo. |
| `organization_subscriptions` (0050) | **Un solo plan por organización** (`unique(organization_id)`), `status active/suspended/cancelled`, `assigned_by/at`, `valid_until`, `notes`; escritura solo superadmin/funciones SECURITY DEFINER; sin DELETE (se cancela, no se borra). | Es la restricción central: imposible expresar "CPR Full + Textil Demo" con un único plan global. |
| `subscription_plan_history` (0050) | Historial append-only de cambios de plan. | Correcto; el modelo futuro debe conservar el patrón. |
| `v_organization_plan_usage` (0052) | Vista de uso/cuota por organización (plan global + storage usado), doble audiencia (miembro/staff) con guarda embebida. | El uso se calcula global; con varios módulos necesita descomposición por módulo. |

Conclusión del análisis: la plataforma ya separa **activación** (por módulo) de
**plan** (global). La necesidad de negocio exige llevar el plan al nivel del módulo.

## 3. Opciones evaluadas

| Opción | Descripción | Ventajas | Riesgos / desventajas |
|---|---|---|---|
| **A** · Evolucionar `organization_modules` (agregar `plan_key`, `status`, `limits`, `activated_by`, `activated_at`…) | Una sola tabla de módulo por empresa. | Un solo lugar; guards actuales ya la leen. | Muta una tabla núcleo de tenancy viva desde 0004; mezcla dos semánticas (interruptor técnico vs contrato comercial); `enabled boolean` vs `status` enum genera ambigüedad durante la transición; migración con más riesgo CPR. |
| **B** · Mantener `organization_modules` como activación simple + crear `organization_module_subscriptions` | Activación técnica y suscripción comercial en tablas separadas. | Aditiva; no toca 0004. | **Dos fuentes de verdad de "acceso"** (enabled + status) que pueden divergir; cada guard/límite debe consultar y reconciliar ambas; deriva probable. |
| **C** · Crear **`organization_module_access`** como tabla explícita de acceso+plan+estado por módulo | Una fila = el acceso completo de una empresa a un módulo. | Modelo que expresa exactamente la necesidad; aditiva (no muta 0004 ni 0050); fuente de verdad única hacia el futuro; `organization_modules` queda como compatibilidad derivada durante la transición y luego se congela/depreca; patrón de escritura idéntico a `organization_subscriptions` (solo superadmin, sin DELETE, historial append-only). | Requiere backfill (plan global actual → fila CPR por empresa), reglas de precedencia con el plan global mientras convivan, y migrar guards/vistas en un sprint dedicado. |
| **D** · Mantener plan global + features por módulo | Sin cambio de esquema; flags de features. | Cero migración. | **No cumple la necesidad**: no puede expresar CPR Full + Textil Demo (un solo `plan_code` global); los "features" degenerarían en un plan paralelo sin gobernanza. Descartada. |

## 4. Recomendación

**Opción C: `organization_module_access`** (DL-18/DL-20), implementada en el sprint
futuro **Plataforma-M1**, nunca en T1. Campos conceptuales (sin migración ahora):

| Campo | Concepto |
|---|---|
| `id` | Identificador. |
| `organization_id` | Empresa (FK compuesta según patrón 0024). |
| `module_key` | `cpr` · `textiles` · `quality` · `construction` (check contra `modules.code`). |
| `plan_key` | `demo` · `full` · `extra` (FK a `plan_definitions.code`). |
| `status` | `pending` · `active` · `suspended` · `cancelled` · `no_access`. |
| `activated_by` / `activated_at` | Quién y cuándo (superadmin/función elevada). |
| `expires_at` | Vencimiento opcional (equivalente a `valid_until`). |
| `storage_limit_mb` | Sobrescritura opcional del límite de storage del plan para ese módulo. |
| `features_enabled` | Ajustes finos opcionales (jsonb), sin sustituir a `plan_limits`. |
| `notes` | Notas administrativas. |
| `created_at` / `updated_at` | Auditoría estándar + `audit_row_change` + historial append-only propio. |

Unicidad: `unique(organization_id, module_key)`. Regla de lectura para guards:
"acceso operativo" = fila con `status='active'` (y no vencida). `no_access` existe
para dejar rastro explícito de una decisión de negación (alternativa: ausencia de
fila = sin acceso; la fila explícita se prefiere para auditoría comercial).

**Reglas de convivencia durante la transición** (a implementar en Plataforma-M1):
1. Backfill: por cada empresa, su `organization_subscriptions.plan_code` actual se
   copia como fila `module_key='cpr'`; `organization_modules.enabled` existente se
   respeta como estado inicial.
2. Precedencia: mientras convivan, la suspensión **global** de la organización
   (`organization_subscriptions.status` o estado de la organización) domina sobre
   cualquier módulo activo; un módulo suspendido no afecta a los demás.
3. `organization_modules` se mantiene sincronizada (derivada) hasta que todos los
   guards lean la tabla nueva; después se congela o se depreca formalmente.
4. `plan_limits` gana dimensión de módulo de forma aditiva (recursos con prefijo
   del módulo, decisión fina en `TRAZALOOP_MODULE_PLANS_DECISION.md`).

## 5. Semántica de Demo (tres cosas distintas — R-24)

| Término | Qué es | Dónde vive |
|---|---|---|
| **Cuenta Demo** | La cuenta de **usuario** creada por registro público ("Crear cuenta Demo"). No tiene plan propio: es una identidad de plataforma. | `auth` + `profiles`. |
| **Empresa Demo** | Una **organización** cuyo acceso es de nivel demo (hoy: plan global `demo`, el default del sistema; futuro: todos sus módulos en `demo` o sin acceso). | `organization_subscriptions` (hoy) → `organization_module_access` (futuro). |
| **Módulo en Demo** | El acceso de una empresa a **un módulo concreto** con `plan_key='demo'` y sus límites. | `organization_module_access` (futuro). |

### Flujo documentado de cuenta Demo y empresa

1. Una persona crea una cuenta Demo (registro público).
2. Acepta los términos legales de la plataforma (mecanismo único existente).
3. Puede crear o asociarse a una empresa (creación/invitación existentes).
4. La empresa queda registrada en Trazaloop (`organizations`).
5. Por defecto recibe el acceso Demo inicial que defina la **política comercial**
   (hoy: plan global `demo` con CPR activado; futuro: fila(s) demo en los módulos
   que la política determine — pregunta abierta Q-21).
6. El superadministrador puede cambiar después el acceso **por módulo**.
7. El superadministrador puede activar Full o Extra por módulo.
8. El superadministrador puede suspender o cancelar el acceso a **un** módulo sin
   cancelar la empresa ni sus otros módulos.
9. La empresa puede tener simultáneamente módulos en estados y planes distintos.

### Estados que nunca deben confundirse

| Estado | De qué | Valores (hoy / futuro) |
|---|---|---|
| Estado de la organización | La empresa como cliente | activa / suspendida (global; domina sobre todo) |
| Estado de la cuenta de usuario | La identidad de la persona | activa / (membresía: active/suspended/revoked por empresa) |
| Estado del acceso a cada módulo | La relación empresa-módulo | hoy `enabled` booleano / futuro `pending/active/suspended/cancelled/no_access` |
| Plan de cada módulo | Nivel comercial por módulo | hoy plan global / futuro `demo/full/extra` por módulo |
| Límites de cada módulo | Cuotas aplicables | hoy `plan_limits` global / futuro `plan_limits` con dimensión de módulo + sobrescrituras |

## 6. Qué significa cada nivel de acceso a un módulo

| Nivel | Significado operativo |
|---|---|
| Demo | Acceso funcional completo al flujo núcleo del módulo con límites bajos (recursos contados) y sin funciones avanzadas; para evaluar. |
| Full | Acceso completo al módulo con límites comerciales estándar (típicamente ilimitados en recursos, límite de storage). |
| Extra | Full + capacidades/capacidad ampliadas según definición comercial (p. ej. más storage). |
| Sin acceso | El módulo no aparece como accesible; sus rutas responden 404/redirección; sin fila activa. |

## 7. Quién puede cambiar el acceso

| Actor | Puede | No puede |
|---|---|---|
| **Superadministrador** (`is_platform_superadmin`) | Activar/desactivar módulos por empresa; asignar plan por módulo; suspender/cancelar módulos; ver uso por módulo; dejar notas y auditoría. | Intervenir datos internos de la empresa fuera de soporte autorizado (DL-15). |
| Staff de plataforma no-superadmin | Ver estado/uso según permisos actuales. | Cambiar accesos o planes. |
| Admin de empresa | Ver los módulos y plan de su empresa; solicitar cambios (canal de soporte). | Autohabilitarse módulos o cambiar su plan (patrón vigente: escritura de suscripciones solo superadmin). |
| Supervisor / Consultor | Usar los módulos habilitados según su rol. | Todo lo anterior. |

## 8. Base normativa y referencias internacionales

| Funcionalidad | Norma o marco de referencia | Cómo se aplica | Qué NO debe prometer |
|---|---|---|---|
| Acceso por módulo | — (arquitectura comercial, no normativa) | n/a | Que un nivel de acceso implique estado de cumplimiento o certificación del cliente. |
| Auditoría de cambios de acceso | Patrón interno append-only (0050) | Historial de asignaciones por módulo. | n/a |

## 9. Riesgos

| Riesgo | Mitigación |
|---|---|
| Divergencia entre `organization_modules` y la tabla nueva durante la transición (R-22/R-23) | Sincronización derivada + un solo punto de escritura (acciones superadmin) + tests de consistencia en Plataforma-M1. |
| Guards que sigan leyendo solo el plan global | Inventario de guards/vistas dependientes como entregable de Plataforma-M1 antes de tocar nada. |
| Confusión Demo (R-24) | Tabla de semántica del §5 replicada en la documentación de usuario y en copy de UI. |

## 10. Criterios de aceptación

- [ ] El modelo actual está descrito con fidelidad al código (tablas, unicidad,
  políticas de escritura).
- [ ] Las 4 opciones tienen análisis y hay una recomendación única con transición.
- [ ] La semántica Demo (cuenta/empresa/módulo) queda inequívoca.

## 11. Próximos pasos

1. Ratificar la Opción C con el propietario del producto (DL-18 queda cerrada como
   dirección; el diseño fino de migración es de Plataforma-M1).
2. Resolver Q-21 (módulos Demo por defecto al registrar empresa).
