# QUALITY-05 · Validación en Staging

**Proyecto:** `qchzkxbnbqeyuxinipln` (trazaloop-staging-qa)
**Production `mvmpadeixomwkpxbnhky`: no se tocó.**

## 1 · Migración

```
supabase db push --project-ref qchzkxbnbqeyuxinipln --include-all
  Applying migration 0122_quality_risks_and_opportunities.sql...
  {"upToDate":false,"migrations":["0122_quality_risks_and_opportunities.sql"]}
  PUSH_EXIT=0
```

Antes: cabecera 0121. Después: **0122**, con `local` y `remote` coincidiendo en
todas las entradas. Solo se aplicó la migración nueva; ninguna anterior se tocó.

## 2 · Las veintitrés tablas existen

`quality_risk_methodologies`, `..._versions`, `quality_risk_scales`,
`quality_risk_scale_levels`, `quality_risks`, `quality_risk_codes`,
`quality_risk_causes`, `quality_risk_consequences`, `quality_risk_processes`,
`quality_risk_objectives`, `quality_controls`, `quality_control_codes`,
`quality_risk_control_links`, `quality_control_activity_links`,
`quality_control_effectiveness_reviews`, `quality_risk_assessments`,
`quality_risk_assessment_factors`, `quality_risk_treatment_plans`,
`quality_risk_materializations`, `quality_risk_signals`, `quality_opportunities`,
`quality_opportunity_codes`, `quality_opportunity_processes`,
`quality_opportunity_objectives`, `quality_opportunity_assessments`,
`quality_opportunity_assessment_factors`.

## 3 · La suite RLS corrió CONTRA Staging

```
NEXT_PUBLIC_SUPABASE_URL=https://qchzkxbnbqeyuxinipln.supabase.co \
npx tsx tests/rls/quality-05-risks-opportunities.test.ts
  → 74 conformes, 0 fallos   ·   EXIT=0
```

No es una repetición decorativa de la corrida local. **Es la que importa**: los
defectos de privilegios de 0115 y 0118 solo aparecieron en remoto, porque un
proyecto de Supabase concede `arwdDxtm` por defecto a `authenticated` sobre cada
tabla nueva. Las comprobaciones que verifican que la sesión **no** puede escribir
en `quality_risk_assessments`, `quality_risk_treatment_plans` ni
`quality_risk_materializations` son exactamente las que habrían fallado sin las
revocaciones explícitas de §15 de la migración.

Se confirmó que la suite escribió de verdad en Staging leyendo las estadísticas
de tabla después: 4 riesgos, 4 evaluaciones, 1 control, 3 oportunidades.

## 4 · Las cuentas QA permanentes, intactas

```
✔ quality.admin@trazaloop-staging.local
✔ quality.reviewer@trazaloop-staging.local
✔ quality.approver@trazaloop-staging.local
```

No se cambió ninguna contraseña, no se recreó ninguna cuenta, y no se ejecutó
ningún cleanup.

## 5 · Aceptación en navegador

Se hizo **en local**, con el artefacto compilado de esta misma rama y con tres
sesiones reales (Ana Admin, Rita Revisora consultora, Alba Aprobadora quality).
Motivo declarado: las contraseñas de las cuentas QA de Staging se mostraron una
sola vez y se destruyeron en el sprint que las creó, y el encargo prohíbe
cambiarlas o recrearlas. Sin ellas no se puede iniciar sesión en Staging.

La base de Staging **sí** se validó, con la suite completa de §3.

## 6 · Estado final del entorno

| | |
|---|---|
| `.env.local` | apunta al stack local (`127.0.0.1:54321`), sin modificar |
| `supabase/.temp/linked-project.json` | reapareció al usar el CLI → **eliminado** |
| Repo | **REMOTE UNLINKED** |
| Production | sin migración, sin deploy, sin variables, sin datos, sin usuarios |
