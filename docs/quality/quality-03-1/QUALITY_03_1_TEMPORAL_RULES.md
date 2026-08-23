# QUALITY-03.1 · Semántica temporal de los periodos

## 1. El defecto, tal como lo encontró una persona

Un indicador mensual vigente desde agosto aparecía con **julio** como medición
pendiente. Al intentar registrar julio, el sistema lo rechazaba —correctamente—
porque el indicador todavía no era aplicable en ese periodo.

Trazaloop generaba una obligación que su propio dominio consideraba inválida.

## 2. La causa

`v_quality_indicator_status` calculaba el periodo pendiente así:

```sql
left join lateral (
  select * from public.quality_previous_period(coalesce(cfg.frequency,'monthly'), current_date)
) due on true
```

«El periodo anterior a hoy», sin preguntar nunca si ese periodo pertenecía a la
vida del indicador. Consultado en agosto, produce julio.

Y julio no es medible: `quality_measurement_guard` exige que exista una
configuración que **cubra** el periodo, y `quality_config_for_period` no
devuelve nada para julio porque `effective_from` es el 1 de agosto.

Reproducido en tres líneas, antes de tocar nada:

```
vigente desde                 | 2026-08-01
la vista pide medir           | 2026-07
  ...y lo marca pendiente     | true
¿el motor acepta ese periodo? | NO — sin configuración vigente
```

**La regla ya existía. Lo que faltaba era que la vista la consultara.**

## 3. La regla definitiva

> Un periodo solo es exigible para un indicador cuando el propio motor lo
> aceptaría.

Se expresa **una sola vez**, en `quality_period_is_eligible()`:

```sql
quality_config_for_period(indicator, period_start, period_end) is not null
and (retired_at is null or retired_at::date >= period_start)
```

y todo lo demás la consulta. Reimplementarla en cada consumidor es exactamente
como nació el defecto.

## 4. Qué fecha manda

**`quality_indicator_configs.effective_from`**, que es la fecha de vigencia
**empresarial**. Nunca `created_at`, que solo dice cuándo alguien tecleó el
registro.

La diferencia importa: un indicador puede declararse hoy con vigencia desde el
mes pasado, y entonces el mes pasado **sí** es exigible. La obligación sigue a
la vigencia, no al momento del tecleo.

## 5. Vigencia a mitad de periodo

Con `effective_from = 15 de agosto` y periodicidad mensual, **agosto sí es
aplicable**. No se inventa aquí ninguna regla de «esperar al primer periodo
completo»: `quality_config_for_period` usa **solapamiento** desde QUALITY-03
—`effective_from <= period_end`—, no contención, y esa semántica está
congelada. Julio, en cambio, nunca.

Si algún día el baseline exige periodos completos, el cambio es de una línea en
`quality_period_is_eligible()` y no toca a ningún consumidor. Eso es lo que se
gana teniendo la regla en un solo sitio.

## 6. El horizonte del objetivo

El encargo pide revisar OI antes de hacer que el periodo de un objetivo limite
la obligación de un indicador. **No se implementa**, y la razón es de modelo:

- OI-25 permite indicadores de alcance `organization`, que no cuelgan de ningún
  objetivo;
- un indicador puede servir a varios objetivos con horizontes distintos;
- ninguna decisión OI dice que el objetivo determine la aplicabilidad temporal
  del indicador.

Hacerlo habría sido inventar una regla. Queda declarado como decisión, no como
olvido.

## 7. Qué cambió, consumidor por consumidor

| Consumidor | Antes | Ahora |
|---|---|---|
| `due_period_*` de la vista | el periodo anterior a hoy, siempre | solo si es elegible; si no, `null` |
| `measurement_pending` | activo + hay configuración | además: existe un periodo exigible |
| `current_period_label` / `next_measurement_due_on` | el periodo en curso, siempre | solo si es elegible |
| `quality_scan_pending_measurements` | `c.effective_from <= b.period_end` con la configuración **de hoy** | `quality_period_is_eligible()`, con la configuración **del periodo** |
| Quality Inicio, ficha del indicador, desempeño del objetivo | leían el `due` fabricado | leen la vista corregida, sin cambios propios |

### 7.1 · El barrido tenía además un defecto propio

La guarda del barrido evaluaba `effective_from` de la configuración **vigente
hoy**. Un indicador que empezó en junio y publicó una meta nueva en agosto
quedaba con `effective_from = agosto`, de modo que julio —perfectamente medible
con la configuración anterior— dejaba de generar tarea. Ahora pregunta por la
configuración aplicable a **ese** periodo, que es la misma pregunta que hace el
motor al registrar.

> **El barrido no se reescribió.** Se copió el cuerpo de 0117 y se cambió
> **una línea**. Una prueba estática (`M4`) compara ambos cuerpos y falla si
> difieren en más de una: la primera vez que se reescribió de memoria se
> perdieron el estado de las alertas y la clave de deduplicación.

## 8. Lo que NO cambió

- **Cero sigue siendo un dato.** `data_state = 'reported'` con valor 0 se
  evalúa como cualquier otro número (T10).
- **La ausencia sigue siendo sin dato.** Un periodo sin medición no se
  interpola ni cuenta como cero (T7).
- **La meta histórica sigue intacta.** Publicar una meta nueva no reevalúa lo
  ya evaluado (T11).
- **Un indicador antiguo conserva su periodo pendiente** (T7). La corrección
  apaga julio para quien no lo tenía, no la función para todos.

## 9. Casos verificados

| Caso | Vigencia | Periodicidad | Pendiente | En curso |
|---|---|---|---|---|
| A | 1 de agosto | mensual | **ninguno** (julio no existe) | agosto |
| B | 15 de agosto | mensual | **ninguno** | agosto (parcial, medible) |
| C | inicio de Q3 | trimestral | **ninguno** (Q2 no existe) | Q3 |
| D | 1 de enero | anual | **ninguno** (el año anterior no existe) | el año en curso |
| E | 2020 | mensual | el mes anterior, como siempre | el mes en curso |

Comprobados contra base real en local y en Staging (`T1`–`T7`), más el barrido
(`T8`, `T9`), el aislamiento (`T12`) y las tres invariantes que no debían
moverse (`T10`, `T11`).
