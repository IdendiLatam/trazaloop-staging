# PE-04B4 · Retirada de los límites legacy

## Lo que se retira

| Qué | Dónde vivía | Estado |
|---|---|---|
| `commercialTierToLegacyPlanCode` | `lib/plans/types.ts` | **retirada** · sin llamantes |
| `resolveEffectiveStorageLimitBytes` | `lib/plans/limits.ts` | **retirada** · sin llamantes |
| `getPlanLimits(usage.planCode)` en `plans.ts` | acción de uso | repuntada al catálogo canónico |
| `getPlanLimits(commercialTier…)` en la consola | detalle de empresa | repuntada al catálogo canónico |

De las dos funciones queda un comentario en su sitio explicando qué hacían y por
qué desaparecieron. Borrarlas sin dejar rastro haría que alguien las reinventara.

## Lo que NO se borra

`plan_limits` y `plan_definitions` siguen ahí. Son historia y respaldo: pueden
hacer falta para reconstruir una decisión pasada. Lo que se retira es su
**autoridad**, y consta en un `comment on` de cada tabla:

> LEGACY · Sin autoridad comercial desde PE-04B4 (0166). La fuente de los
> límites es `plan_revision_limits`.

## Paridad verificada

Los trece límites funcionales se copiaron byte a byte en 0162/0163. Comprobado
comparando las dos tablas recurso a recurso: `documents_trazadocs`, `suppliers`,
`materials`, `products`, `evidences`, `production_orders`, `input_batches`,
`output_batches`, `team_members`, `roles_enabled`,
`diagnostic_recommendations_enabled`, `imports_enabled`, `storage_bytes`.

Free ↔ demo y Full ↔ full coinciden en los trece. El comportamiento no cambia;
cambia de dónde se lee.

## Un cambio de comportamiento que sí hubo, y a mejor

El código legacy hacía:

```ts
const limit = findLimit(limits, resourceCode);
if (!limit) return { allowed: true, error: null };   // ← un límite ausente PERMITÍA
```

Un recurso que el plan no declaraba se leía como «sin límite». Ahora un límite
`not_configured` **niega**: no es «ilimitado» ni «cero», es que nadie lo ha
decidido, y sobre lo que no se sabe no se autoriza. Es el mismo criterio de los
tres estados de límite de 0162 y de la cuota de almacenamiento de 0164.

## Los controles internos de IA, reclasificados

No se borra ninguno. Cambian de **nombre público**:

- `intelligence_usage_limits` → protección de coste y anti-abuso. Sus mensajes
  nunca deben decir «agotaste tus créditos».
- `intelligence_limit_overrides` → excepciones operativas internas.
- `quality_ai_settings.monthly_run_limit` y `.daily_user_limit` → salvaguardas
  internas heredadas. El segundo, además, multiplicaba la cuota por persona, que
  contradice «la cuota es de la empresa»; sobrevive como anti-abuso, no como
  plan.

Los cuatro llevan un `comment on` que lo dice. Y cuando una de ellas deniega, el
crédito comercial reservado **se libera**: no se ejecutó nada, así que no se
cobra.
