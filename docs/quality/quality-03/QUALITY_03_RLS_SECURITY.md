# QUALITY-03 · RLS, privilegios y aislamiento

---

## 1. Dos capas, y la de abajo es la que importa

| Capa | Qué decide | Qué pasa si falla |
|---|---|---|
| **Privilegios** (`grant`/`revoke`) | si el rol puede *intentar* la operación | error `42501` |
| **RLS** (políticas) | qué filas ve o toca | 0 filas, o violación de política |

Ninguna de las dos sobra, y la lección de este sprint es exactamente por qué:
**«0 filas afectadas» no es «denegado»**. PostgREST devuelve 204 sin error. Una
tabla que solo se defiende con RLS parece segura y no puede demostrarlo.

---

## 2. Políticas por tabla

| Tabla | Políticas | Lectura |
|---|---|---|
| `quality_objectives` | SELECT, INSERT, UPDATE, DELETE | gestionable desde la interfaz |
| `quality_indicators` | SELECT, INSERT, UPDATE, DELETE | gestionable desde la interfaz |
| `quality_objective_indicators` | SELECT, INSERT, DELETE | se asocia y se desasocia; no se «edita» |
| `quality_objective_processes` | SELECT, INSERT, DELETE | íd. |
| `quality_measurement_evidence` | SELECT, INSERT, DELETE | se adjunta y se quita; **nunca se reescribe** |
| `quality_indicator_configs` | **solo SELECT** | la escribe `quality_publish_indicator_config` |
| `quality_measurements` | **solo SELECT** | la escriben las tres RPC de medición |
| `quality_calculation_runs` | **solo SELECT** | la escribe el motor de cálculo |
| `quality_period_closures` | **solo SELECT** | la escriben cerrar/reabrir |
| `work_events` | **solo SELECT** | append-only; un trigger impide `update` y `delete` |

Deny-by-default: sin política no hay acceso. Las cinco tablas de solo lectura
**no tienen** política de `INSERT`, `UPDATE` ni `DELETE`, y ese vacío es la
decisión, no un olvido.

---

## 3. Privilegios · lo que costó dos intentos

0117 §21 concedió `select` a las tablas del motor y revocó
`truncate, references, trigger`. En local quedó perfecto. En Staging, no:

```
✘ G5. los eventos son INMUTABLES (AT-03): se reescribió un evento
✘ X2. no se puede alterar una evaluación calculada: se alteró una evaluación
```

**Por qué solo allí.** Los privilegios por defecto de una tabla nueva no son los
mismos en los dos entornos:

| | local | proyecto remoto de Supabase |
|---|---|---|
| a `anon` / `authenticated` | `Dxtm` | `arwdDxtm` |

En remoto eso incluye `insert`, `update` y `delete`. **Conceder `SELECT` no
retira lo que el entorno ya concedió.**

**Por qué solo lo delataron las pruebas de UPDATE.** Un `INSERT` que viola una
política de inserción **levanta error** en los dos entornos, así que X1, X3 y X4
pasaban en ambos. Un `UPDATE` sin política simplemente no encuentra filas: sin
privilegio da `42501` (local, verde), con privilegio da 204 y silencio (Staging,
rojo). El agujero era invisible justo en el entorno donde se desarrolla.

**0118** revoca el DML sobre las cinco tablas de solo lectura, y sobre
`quality_measurement_evidence` revoca únicamente `update`. Solo revoca y
comenta: no crea, no altera y no toca datos. 0117 quedó intacta —está desplegada
y no se edita una migración desplegada—.

Es la tercera vez que el proyecto tropieza con esto (0111, 0112 §12, 0115). La
prueba **M15** lo fija ahora en local: si una tabla nueva de solo lectura no
revoca su DML, la regresión local se pone roja antes del despliegue.

### 3.1 · Estado final verificado

```
quality_calculation_runs   → authenticated: SELECT
quality_indicator_configs  → authenticated: SELECT
quality_measurements       → authenticated: SELECT
quality_period_closures    → authenticated: SELECT
work_events                → authenticated: SELECT
quality_measurement_evidence → authenticated: SELECT, INSERT, DELETE
quality_objectives         → authenticated: SELECT, INSERT, UPDATE, DELETE
quality_indicators         → authenticated: SELECT, INSERT, UPDATE, DELETE
anon                       → NADA en ninguna
```

`TRUNCATE` está revocado en todas: **bypasea la RLS por completo**, y un rol de
cliente no debe tenerlo ni sobre las tablas que sí puede escribir.

---

## 4. Multiempresa

Todas las tablas llevan `organization_id`, todas las políticas filtran por la
empresa activa de la sesión y las relaciones usan **FK compuestas**
`(organization_id, parent_id)`. Un indicador no puede apuntar a un proceso de
otra empresa aunque el identificador sea válido: la FK lo impide antes que la
RLS.

Comprobado contra base real, con sesiones distintas —no con `service_role`—:

```
✔ X5. una empresa ajena no ve NADA de la otra
✔ X6. un ajeno no puede medir, calcular ni cerrar en otra empresa
✔ X7. un indicador no puede apuntar a un proceso de otra empresa
✔ E6. un cálculo NUNCA usa datos de otra empresa
```

---

## 5. Las RPC

Todas `security definer` con `search_path` fijo, `revoke all … from public,
anon` y `grant execute … to authenticated`. Cada una comprueba el rol **dentro**
de la función mediante `current_org_role()`; el cliente nunca declara su rol.

| RPC | Quién puede |
|---|---|
| `quality_publish_indicator_config` | administrador / gestor de calidad |
| `quality_record_measurement` | responsable del indicador o gestor |
| `quality_run_indicator_calculation` | responsable o gestor |
| `quality_correct_measurement` | gestor, con motivo obligatorio |
| `quality_close_period` | administrador / gestor |
| `quality_reopen_period` | **solo administrador**, con motivo obligatorio |
| `quality_scan_pending_measurements` | gestor |

`quality_native_source_value`, `quality_compute_calculated`,
`quality_evaluate_value` y las demás auxiliares están revocadas también a
`authenticated`: son piezas internas del motor, no API.

---

## 6. Vistas

`v_quality_indicator_status` y `v_quality_objective_performance` se declaran con
`security_invoker = true` (MDR-16/MDR-37). Una vista sin eso corre con los
permisos de quien la creó y se convierte en la puerta trasera por la que se lee
lo que la RLS de la tabla niega.

---

## 7. Ataques comprobados contra la base real

Las siete pruebas de la sección X atacan por PostgREST con la sesión de un
usuario legítimo, saltándose la interfaz y las server actions:

| | Intento | Resultado |
|---|---|---|
| X1 | insertar una medición a mano | rechazado |
| X2 | alterar una evaluación calculada | rechazado |
| X3 | fabricar una ejecución de cálculo | rechazado |
| X4 | fabricar un cierre de periodo | rechazado |
| X5 | leer datos de otra empresa | nada visible |
| X6 | medir/calcular/cerrar en otra empresa | rechazado |
| X7 | apuntar a un proceso ajeno | rechazado |

Más `E4` (escribir el resultado de un automático), `F3` (escribir el desempeño
de un objetivo a mano) y `G5` (reescribir un evento).
