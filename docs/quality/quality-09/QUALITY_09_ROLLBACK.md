# QUALITY-09 · Reversión

## 1 · Qué se puede revertir sin tocar la base

Todo lo visible. El dominio de Auditorías es **aditivo**: ninguna pantalla
anterior cambió de comportamiento.

| Paso | Efecto |
|---|---|
| Quitar `QUALITY_AUDITORIAS_GROUP` de `lib/modules/registry.ts` | Desaparece del menú de Quality |
| Revertir el commit de QUALITY-09 | Desaparecen rutas, pantallas, acciones y los doce papeles |
| No desplegar | El Preview no está promovido ni tiene alias |

Las tablas quedan vacías y sin puerta. Nada de lo anterior deja de funcionar.

## 2 · Qué NO se debe revertir en la base

`0127_quality_audits.sql` es **append-only**, como todas. No se edita una vez
aplicada a Staging, no se repara y no se hace `drop`.

Si hiciera falta una corrección, la forma es **`0128`**, aditiva, con su propia
validación local completa antes de tocar Staging.

## 3 · Lo que la migración tocó fuera de su dominio

Ampliaciones de catálogo del motor transversal —siempre `drop constraint` +
`add constraint` con el conjunto anterior **más** los valores nuevos—:

| Tabla | Qué se añadió |
|---|---|
| `work_tasks` | 6 tipos de tarea · dominio `audit` · 3 tipos de asunto |
| `work_alerts` | 6 tipos de aviso · dominio `audit` |
| `work_events` | dominio `audit` · 3 tipos de asunto · `audit.checklist_version_published` y `audit.report_issued` |
| `work_decisions` | 3 clases de asunto · 4 clases de decisión |
| `work_references` | 3 clases de dueño · clases de referencia del dominio |
| `work_reference_must_be_valid()` | reescrita para admitir las referencias nuevas |
| `quality_deletion_eligibility()` | reescrita para admitir `audit` y `audit_program` — **conservando** las guardas heredadas |

Revertir cualquiera de esas ampliaciones rompería filas ya escritas por este
dominio. Si algún día se retira QUALITY-09, la vía es dejar de escribir esos
valores, no quitarlos del catálogo.

## 4 · Datos

La migración **no siembra nada**: cero `insert` de negocio. No reescribe datos
de otros módulos: cero `update` sobre `customer_requirements`, `work_cases` o
`evidences`.

Lo único escrito en Staging son los datos efímeros de la suite, ya retirados
lógicamente (`QUALITY_09_STAGING_VALIDATION.md` §6).

## 5 · Production

No se tocó. Cabecera **0111**, sin migraciones, sin datos, sin variables, sin
despliegue. Revertir allí no aplica porque allí no se aplicó nada.
