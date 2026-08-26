# QUALITY-05 · Evaluación del riesgo

**Decisiones:** RO-05, RO-07, RO-09, RO-12, RO-18, RO-20, RO-35.

## Inherente y residual son dos filas, nunca dos columnas

```
INHERENTE  →  CONTROLES  →  RESIDUAL
(sin nada)     (lo que      (con ellos
               ya existe)    puestos)
```

Guardar `inherent_score` y `residual_score` en la misma fila obligaría a pisar uno
de los dos en cada revisión. Aquí cada evaluación es una fila con su tipo, su
fecha, su autor y la versión de metodología que usó.

**RO-09 es la regla dura: una reevaluación NUNCA sobrescribe la anterior.**
Marzo Alto, junio Medio y diciembre Bajo son tres filas. Lo que la pantalla llama
«vigente» es la última de cada tipo, calculada por la vista
`v_quality_risk_overview`.

## Qué se conserva de cada evaluación

| Campo | Por qué |
|---|---|
| `methodology_version_id` | MDR-36: FK a la versión inmutable, no una copia |
| factores (tabla hija) | Qué se eligió en cada dimensión, con FK real al nivel |
| `score` | Derivado por `quality_derive_level`, nunca tecleado |
| `result_level_id` | El nivel, también derivado |
| `derivation` (jsonb) | El rastro visible: factores, regla, banda |
| `assessed_by` / `assessed_on` | El acto lo firma una **persona** (MDR-33) |
| `rationale` | Por qué se valoró así |

## La residual exige declarar los controles

`quality_assess_risk(..., p_kind := 'residual', p_control_ids := null)` **falla**:

> Una evaluación residual tiene que declarar qué controles se consideraron.

Sin controles, la residual sería la inherente con otro nombre. Y cada control
considerado queda como referencia con una **foto de su estado de eficacia en ese
momento**:

```json
{ "control_code": "CTRL-2026-001",
  "control_title": "Stock mínimo de seguridad…",
  "effectiveness_verdict": "partially_effective",
  "reviewed_on": "2026-08-26" }
```

Si mañana ese control se vuelve a evaluar, esta evaluación residual sigue
explicando qué se sabía cuando se hizo (§51: referencia viva + foto histórica).

## El residual PUEDE ser peor que el inherente

No hay ninguna restricción `residual <= inherent`, y es deliberado (§28, §75). Un
residual igual o mayor es la forma correcta de registrar que:

- el contexto empeoró;
- el control resultó ineficaz;
- los factores se revalorizaron.

Rechazarlo obligaría a falsear la evaluación para que «cuadre». La ficha lo dice
sin dramatismo:

> La residual no bajó respecto de la inherente. No es un error del sistema: puede
> pasar si el contexto empeoró o si los controles no resultaron eficaces.

Probado en la sección D3 de la suite RLS.

## Nivel ≠ prioridad administrativa (RO-18)

El resultado matemático **ayuda** a decidir; no decide. Que un riesgo salga «Alto»
no lo convierte en rechazado, ni en no conformidad, ni en tratado. `status` y
nivel son ejes distintos y la lista los muestra como dos insignias separadas.

## La revisión sale del nivel (RO-35)

Al registrar una evaluación, la RPC copia `review_months` del nivel obtenido y
reprograma `next_review_on`. Un extremo pide revisión al mes; un bajo, al año. No
hay aniversario impuesto: si la metodología no declara periodicidad, no se inventa
ninguna.

## Lo que una señal NO puede hacer (RO-12, RO-20)

Una medición fuera de meta, una alerta o una materialización pueden **pedir** que
se reevalúe —creando una tarea— pero ninguna cambia una evaluación por su cuenta.
La única forma de que exista una evaluación es que una persona con rol la registre.
