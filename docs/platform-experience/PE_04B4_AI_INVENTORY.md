# PE-04B4 · Inventario de Intelligence

Levantado leyendo el repositorio y la base aplicada, no la arquitectura de
PE-04A.

## 1 · Los tres caminos que llaman a un modelo

| Camino | Operación | Guardas ANTES de B4 |
|---|---|---|
| `lib/ai/copilot.ts` → `quality_ai_start_run` | las **siete** del Copilot | `is_enabled` + `quality_ai_feature_allowed` + 500 ejecuciones/mes por empresa + **50/día por PERSONA**. No pasaba por `intelligence_usage_guard`. |
| `lib/intelligence/document-review/contextual-review.ts` → `document_review_start_run` | `document.contextual_review` | módulo Full/Extra + 60/día por persona + `intelligence_usage_guard` |
| `lib/intelligence/document-authoring/quick-edit.ts` → `document_authoring_start_run` | `document.quick_edit` | ídem + 100/día por persona |

`lib/ai/provider.ts` y `lib/ai/providers/*` son transporte: no ejecutan por su
cuenta y no reservan. Están declarados como tales en el guardia.

## 2 · Las diez operaciones reales

`USE_CASES` declara **siete** del Copilot (`ask`, `explain_signal`,
`root_cause`, `risk_candidates`, `review_summary`, `audit_prep`,
`customer_themes`) y hay **dos** de documentos, más el alias histórico
`copilot.ask`. El catálogo `intelligence_use_cases` de QUALITY-12 solo describía
**seis**: faltaban `explain_signal`, `risk_candidates`, `review_summary` y
`audit_prep`. 0166 las añade, de modo que ningún camino de modelo queda sin
describir.

## 3 · Los controles que había, clasificados

| Control | Valor | Alcance | Clase real |
|---|---|---|---|
| `intelligence_usage_limits.runs_per_minute` | 60 | empresa | **límite de tasa** |
| `…runs_per_hour` | 600 | empresa | **límite de tasa** |
| `…max_concurrent` | 8 | empresa | **guardia de concurrencia** |
| `…runs_per_month` | **10 000** | empresa | **protección de coste interna** — nadie vende 10 000 |
| `…soft_limit_percent` | 80 | empresa | aviso interno |
| `intelligence_limit_overrides` | — | empresa | excepción operativa interna |
| `quality_ai_settings.monthly_run_limit` | 500 | empresa | **legacy**: contaba EJECUCIONES, no créditos |
| `quality_ai_settings.daily_user_limit` | 50 | **persona** | **legacy**: multiplicaba la cuota por usuario |
| `quality_ai_settings.is_enabled` | false | empresa | interruptor de producto |

**Ninguno contaba créditos ponderados**, que es la unidad que el negocio
congeló. Y dos contradecían la regla «la cuota es de la empresa»: el tope diario
por persona la multiplicaba por el número de empleados.

## 4 · Qué sobrevive y con qué nombre

Nada útil se borra. Lo que cambia es **de qué se dice que son**:

- Los topes por minuto, por hora y de concurrencia siguen: son anti-abuso.
- El techo de 10 000 al mes sigue: es protección de coste del proveedor.
- Los dos de `quality_ai_settings` siguen como salvaguarda interna.

Los cuatro llevan ahora un `comment on` que dice explícitamente que **no** son
la cuota comercial y que sus mensajes nunca deben decir «agotaste tus créditos».
Cuando una de esas salvaguardas deniega, el crédito comercial reservado **se
libera**: no se ejecutó nada, así que no se cobra.

## 5 · Telemetría de coste · intacta

`quality_ai_runs` sigue guardando tokens de entrada, tokens en caché, tokens de
salida, tokens de razonamiento, total, modelo, proveedor, latencia, estado y si
se llegó a llamar. `intelligence_model_pricing` e `intelligence_run_cost_usd`
siguen calculando el coste real. **Los créditos no sustituyen a nada de esto**:
son la unidad comercial, no la contable.

## 6 · Historia

Las ejecuciones anteriores al corte no tienen peso asignado. Reconstruirlo sería
inventar consumo que nadie hizo, así que **la contabilidad comercial de créditos
empieza en 0166** y queda dicho en un `comment on` de la propia columna. El
historial de tokens y coste se conserva íntegro y no se reinterpreta.
