# QUALITY-03 · Fuentes automáticas

Quality ofrece indicadores **nativos**: se calculan desde datos que Trazaloop ya
tiene registrados, sin que nadie teclee el resultado (OI-16).

---

## 1. El catálogo es cerrado, y esa es la decisión

`quality_native_source_value(organization_id, key, period_start, period_end)`
es un `case` sobre cinco claves. No acepta una expresión, ni una consulta, ni un
nombre de tabla. Si la clave no está en el catálogo, la función levanta un error.

`quality_native_source_keys()` publica el catálogo para que la interfaz lo
ofrezca en un selector, y una prueba estática comprueba que el enumerado del
dominio y el de la base **no puedan divergir**.

> Un catálogo abierto —«dinos qué consulta quieres»— sería más flexible y sería
> una superficie de inyección con permisos de propietario. La función corre como
> `security definer` para poder leer las tablas de Quality; darle además una
> consulta libre sería entregar la base.

---

## 2. Las cinco fuentes

| Clave | Qué mide | Naturaleza | Unidad | Dirección |
|---|---|---|---|---|
| `quality.documents_effective_ratio` | % de documentos de Quality vigentes sobre los activos | instantánea | % | mayor es mejor |
| `quality.documents_review_overdue_count` | documentos con revisión periódica vencida | instantánea | conteo | menor es mejor |
| `quality.document_approval_lead_time_days` | días promedio de envío a revisión → aprobación | de periodo | días | menor es mejor |
| `quality.processes_published_ratio` | % de procesos activos con revisión publicada | instantánea | % | mayor es mejor |
| `quality.open_document_tasks_count` | tareas documentales sin cerrar | instantánea | conteo | menor es mejor |

Las cinco salen de QUALITY-01/01.2/02: procesos, revisiones, control documental
y bandeja de tareas. **Quality se mide a sí misma con lo que ya produce**, que es
lo que «Quality by Observation» significa en la práctica (OI-01).

### 2.1 · Instantánea y de periodo no son lo mismo

Tres de las cinco son **instantáneas**: responden «cómo está esto hoy». Su
`jsonb` de linaje guarda `as_of` con el momento exacto de la lectura, porque el
mismo indicador leído mañana dará otro número y hay que poder decir cuándo se
leyó.

`document_approval_lead_time_days` es **de periodo**: cuenta las revisiones
aprobadas *dentro* del periodo medido. Repetir el cálculo del mismo periodo
cerrado da el mismo número.

Mezclar las dos naturalezas sin distinguirlas produce series que parecen
comparables y no lo son.

---

## 3. Cero no es «sin dato», tampoco aquí

Cada fuente decide explícitamente qué devuelve cuando no hay universo:

```sql
case when v_total = 0 then null else round(v_matched * 100.0 / v_total, 2) end
```

Un porcentaje sin denominador es `null` → `unavailable`. **No es cero**: no
tener documentos no es tener el 0 % vigente.

En cambio `documents_review_overdue_count` sí devuelve **0** cuando no hay
ninguno vencido, y ese cero es un dato excelente que debe verse como tal.

---

## 4. Linaje (OI-10)

Cada ejecución guarda en `quality_calculation_runs`:

- qué clave se usó y con qué configuración;
- el `jsonb` de componentes que produjo el número (`total_active`, `effective`,
  `as_of`, `nature`…);
- el valor devuelto;
- si falló, el error.

Con eso, un número que sorprende puede reconstruirse: no hay que creerle al
sistema, se puede comprobar.

**Recalcular sin cambios no ensucia el historial** (prueba E5): si el resultado
es idéntico al vigente, no se crea una medición nueva. Un historial lleno de
filas idénticas es un historial que nadie lee.

---

## 5. Fallo técnico ≠ mal desempeño (OI-31)

Si una fuente no puede calcularse, la medición queda como `unavailable` con el
error en la ejecución. **No queda como `not_met`.** Un indicador que aparece
«fuera de meta» porque la integración falló es una mentira operativa: manda a
alguien a analizar un problema de calidad que en realidad es un problema de
plomería.

---

## 6. Aislamiento

`p_organization_id` no es un parámetro de conveniencia: **todas** las consultas
del catálogo filtran por él, y la RPC que lo invoca lo toma de la sesión, nunca
del cliente. La prueba E6 lo comprueba contra la base real creando datos en dos
empresas y verificando que el cálculo de una no ve nada de la otra.

---

## 7. El navegador no puede escribir un automático

Cuatro capas, de fuera hacia dentro:

1. la interfaz no muestra campo de valor para un indicador automático;
2. la server action no envía `value` ni `evaluation` para esas fuentes;
3. `quality_measurement_guard()` rechaza un valor manual sobre una fuente
   automática;
4. `quality_measurements` no concede `insert` ni `update` a `authenticated`
   —0117 §21 más **0118**—.

Las pruebas E4 y X1 atacan por PostgREST, saltándose las dos primeras.
