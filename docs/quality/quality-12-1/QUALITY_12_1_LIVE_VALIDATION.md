# QUALITY-12.1 · Validación contra el proveedor real

> **Estado: primera prueba humana hecha. Encontró dos defectos, los dos
> corregidos. Falta repetirla.**

## Lo que pasó en la primera prueba

El proveedor real **sí se invocó**: dos consultas quedaron registradas con
`provider = openai` y `model = gpt-5.4-mini`. Pero las dos respondieron «sin
evidencia · 0 fuentes», y una tardó 19,5 s mostrando 0 tokens.

### La causa, medida

Las dos consultas se hicieron en la empresa **«Trazaloop QA Permanente ·
Quality»** (`8bc9bf21…`), con la cuenta `quality.admin@trazaloop-staging.local`
(`2b27d90e…`). Esa empresa está **vacía**:

```
quality_processes 0 · trazadoc_documents 0 · work_cases 0 · work_actions 0
quality_objectives 0 · quality_controls 0 · quality_knowledge_items 0
quality_customer_feedback 0 · quality_automation_rules 0 · quality_signals 0
quality_audits 0 · quality_risks 0 · quality_survey_campaigns 0
```

La empresa sembrada para la validación —**«QUALITY-12.1 en vivo 41721770»**,
`1837779e…`, con el documento de dos revisiones— **no registró ni una sola
consulta**: `quality_ai_runs` para ese `organization_id` estaba vacía.

Así que **«sin evidencia» era la respuesta correcta**: en esa empresa no hay
nada autorizado que leer, y el Copilot hizo exactamente lo que §19 y §67 piden
—decirlo en vez de inventar—. **No hubo defecto de recuperación**, y la sección
siguiente lo demuestra con la sesión real.

### Pero la prueba destapó dos defectos reales

**Defecto 1 · la consulta mentía sobre sí misma.** Con el contexto vacío el
Copilot **no llama al proveedor** —correcto: sin datos no se pregunta— pero la
consulta quedaba guardada como `openai · gpt-5.4-mini` con cero tokens, y la
pantalla lo mostraba igual. Quien lo lee entiende lo contrario de lo que pasó.
Que hiciera falta abrir la base de datos para saber si hubo llamada **es el
defecto**.

**Defecto 2 · 19,5 s sin hablar con nadie.** Las diecinueve fuentes se leían en
fila india contra una base remota: decenas de idas y vueltas encadenadas.
Además de ser lento, ese tiempo es lo que hacía creer que el modelo estaba
pensando.

Los dos están corregidos. Ver el informe de implementación.

## Verificación previa a repetir la prueba (§16)

Con la **sesión real** del usuario de la empresa sembrada —sin clave de
servicio, sin fijar el documento, con la pregunta abierta tal cual—, contra
**Staging**:

```
AHORA         : 1095 ms · source_count=10 · references=17
                TRES=true  · CINCO=false · doc=[11] Revisión 2 @ 2026-08-27
HACE 6 MESES  :  910 ms · source_count=10 · references=19
                TRES=false · CINCO=true  · doc=[13] Revisión 1 @ 2026-02-28
```

* `source_count > 0` ✔
* el contexto de **ahora** contiene **«TRES días»** y no «CINCO días» ✔
* el contexto **a fecha** contiene **«CINCO días»** y no «TRES días» ✔
* la cita histórica dice a qué fecha y a qué revisión mira ✔

Antes de leer las fuentes a la vez, lo mismo tardaba 4972 ms y 4119 ms **en
local**; contra Staging desde una función de Vercel, entre 17 y 20 s.

## Lo verificado sin credencial

| Qué | Cómo |
|---|---|
| Réplica limpia 0001…**0134** | desde cero, `EXIT 0` |
| Staging al **0134** | 126 migraciones, sin desalineadas |
| **Production intacta** | sigue en **0111**, sin variables de IA |
| Las cuatro suites | 42 + 27 + 31 + 25, **cero fallos** |
| Regresión completa | `npm run test:all` → **EXIT 0**, antes y después de reconstruir la base |

## Lo que falta, y ahora sí se puede comprobar

| # | Comprobación | Resultado | Evidencia |
|---|---|---|---|
| 1 | salida estructurada válida | — | — |
| 2 | citas válidas | — | — |
| 3 | procedencia `openai · gpt-5.4-mini` | **parcial** | registrada en las dos consultas de la primera prueba |
| 4 | consumo con detalle real | — | pendiente de una consulta **con** contexto |
| 5 | documento histórico con modelo real | — | contexto ya demostrado arriba |
| 6 | temas persistidos con procedencia real | — | — |
| 7 | barreras con modelo real | — | — |
| 8 | sin datos, no inventa | **PASS** | las dos consultas de la primera prueba |
| 9 | anonimidad con modelo real | — | — |
| 10 | fallo aislado | — | — |
| 11 | una consulta sin contexto se declara «sin llamada» | — | corregido, pendiente de verse en vivo |
