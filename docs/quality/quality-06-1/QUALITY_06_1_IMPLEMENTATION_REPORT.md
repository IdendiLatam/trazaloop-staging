# QUALITY-06.1 · Informe de implementación

Onboarding QMS · Contexto operacional de la evaluación

---

## Qué se pidió, y qué se hizo

QUALITY-06 cerró con **111 PASS · 2 GAP · 0 FAIL**. Los dos huecos eran:

- **GAP-1** (PC-10, criterio 56) — onboarding QMS sin pantalla propia.
- **GAP-2** (PC-28, §39) — la evaluación no mostraba contexto operacional.

Los dos están cerrados. **Sin migración**: los datos ya estaban, lo que faltaba
era leerlos bien.

## A · Baseline

Obtenido de Git, no del encargo:

```
git rev-parse HEAD            → bff5988d9e6aeb4137fffbf1d286fe6fe610cd83
git status --short            → (vacío)
supabase/.temp/project-ref    → no existe · REMOTE_UNLINKED
supabase/migrations           → …, 0123, 0124
```

Rama `fix/quality-06-1-onboarding-evaluation-context` creada desde ese HEAD.
Sin force push, sin rebase destructivo.

## B · Migraciones

**Ninguna.** Local **0124** · Staging **0124** · Production **0111**, igual que
antes de empezar. Una prueba comprueba que no exista ningún archivo por encima
de 0124, y otra que ninguna migración del repositorio cree esquema de
onboarding.

## C · GAP-1 · Onboarding

Ruta `/quality/people/[personId]/onboarding/[assignmentId]`, abierta desde la
ficha de persona (cada asignación, incluidas las cerradas) y desde la ficha del
cargo (cada ocupante vigente).

Responde las once preguntas del §5 del encargo, todas derivadas: cargo, fecha,
responsabilidades del perfil, procesos, documentos, competencias requeridas,
competencias demostradas, brechas, desarrollo pendiente, conocimiento relevante
y tareas abiertas.

Tres decisiones que definen el resultado:

1. **El perfil es el de la fecha efectiva**, no el último publicado. Si hoy rige
   otra versión, se añade una columna «Hoy se exige» al lado de lo que se
   exigía. Se distingue; no se sustituye.
2. **Solo relaciones reales.** Cada proceso y cada documento llevan escrito por
   qué aparecen. No existe la regla «todo empleado debe leer todos los
   documentos».
3. **El checklist no afirma lo que no se puede demostrar.** Trazaloop no
   registra confirmación de lectura, así que no hay casilla «leído»: los
   documentos se listan como información y se explica por qué. Y no se declara
   «completo»: se dice cuántos pendientes hay y de qué tipo.

Detalle en `QUALITY_06_1_ONBOARDING.md`.

## D · GAP-2 · Contexto operacional

Ruta `/quality/people/performance/[evaluationId]`: arriba el **resultado**,
abajo y con borde propio el **contexto**.

El puente es siempre `Persona → Asignación → Cargo → Proceso → Dato`. Cada línea
nombra primero de qué habla —«Proceso Gestión de Compras»—, se lee por las
mediciones cuyo periodo cae dentro del periodo evaluado, y lo que no se puede
reconstruir se marca «Estado actual».

No hay puntaje, ni promedio, ni columna nueva: el contexto es una proyección. La
capa no escribe nada. Y el panel trae también lo favorable —metas cumplidas,
acciones completadas, desarrollo hecho, competencia declarada— porque un panel
sesgado hacia los incumplimientos deja de ser contexto.

Detalle en `QUALITY_06_1_EVALUATION_CONTEXT.md`.

## E · Privacidad

Sin permisos nuevos. El onboarding vive en el círculo de la ficha de persona y
el contexto en el del desempeño, los dos de QUALITY-06. Un `consultant` con
acceso general a Quality no obtiene ninguno de los dos — comprobado contra base
real. Detalle en `QUALITY_06_1_PRIVACY.md`.

## F · Exportación

Una clave nueva: `quality.onboarding.detail` · «Onboarding del sistema de
gestión». Y el PDF de evaluación gana la sección de contexto **tras un salto de
página**. Q06 + Q06.1 con pendientes = 0. Detalle en `QUALITY_06_1_EXPORT.md`.

## G · Pruebas

| | |
|---|---|
| `npm run test:quality061` | 46 conformes, 0 fallos |
| `npm run test:quality061-rls` (local) | 28 conformes, 0 fallos |
| `npm run test:quality061-rls` (Staging) | 28 conformes, 0 fallos |
| `npm run test:quality06-rls` (Staging, regresión) | 58 conformes, 0 fallos |
| `npm run test:all` | **TEST_ALL_EXIT_REAL=0** |

La suite contra base real importa `getOnboarding` y `getEvaluationContext` —el
código que corre en producción— y les pasa el cliente de un usuario real, en vez
de reimplementar las consultas. Detalle en `QUALITY_06_1_TEST_MATRIX.md`.

## H · Staging y Preview

Staging sigue en 0124 con paridad total; datos efímeros retirados. Preview
`https://trazaloop-production-9g6j4103h-idendi-latam-s-projects.vercel.app`,
target `preview`, Ready, SSO activo, tres variables solo en esta rama apuntando
a Staging. Detalle en `QUALITY_06_1_STAGING_VALIDATION.md`.

## I · Production

**Sin tocar.** Este sprint no ejecutó **ningún** comando contra Production, ni
de lectura: su estado (0111) se conoce de QUALITY-06 y nada pudo cambiarlo,
porque no hubo migración ni despliegue.

---

## Los 66 criterios de cierre

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| 1 | baseline Q06 correcto | **PASS** | HEAD `bff5988` obtenido de Git, árbol limpio, 0123 y 0124 presentes, remote-unlinked |
| 2 | rama correcta | **PASS** | `fix/quality-06-1-onboarding-evaluation-context` desde ese HEAD |
| 3 | sin rediseño | **PASS** | cero migraciones; ninguna tabla de Q06 alterada |
| 4 | onboarding route | **PASS** | `/quality/people/[personId]/onboarding/[assignmentId]`, desplegada |
| 5 | onboarding desde Person | **PASS** | enlace por asignación en la ficha (prueba M1) |
| 6 | onboarding desde Assignment | **PASS** | la ruta se identifica **por** la asignación |
| 7 | Person sin User funciona | **PASS** | escenario A2 en base real, con `profile_id` nulo |
| 8 | cargo correcto | **PASS** | escenario A1 |
| 9 | profile/version correcta | **PASS** | escenario A3: resuelve la v1 |
| 10 | historical profile preserved | **PASS** | escenario B2: publicar la v2 no movió el onboarding anterior |
| 11 | processes derived | **PASS** | escenario A5: propiedad del cargo + funciones del perfil |
| 12 | docs derived | **PASS** | escenario A5: llega por el proceso y lo dice |
| 13 | competencies derived | **PASS** | escenario A4 |
| 14 | required vs demonstrated | **PASS** | columnas separadas, con método y fecha |
| 15 | gap explicable | **PASS** | requerido − demostrado, y el checklist lo redacta |
| 16 | no auto training | **PASS** | prueba D5: la capa de datos no crea desarrollo |
| 17 | development shown | **PASS** | necesidades e items de la persona o del cargo |
| 18 | knowledge shown | **PASS** | escenario A6 |
| 19 | transfer shown | **PASS** | estado `transfer_in_progress` con el título del plan |
| 20 | real tasks shown | **PASS** | `work_tasks` abiertas; no se fabrica ninguna |
| 21 | no fake checklist claims | **PASS** | pruebas D1–D4: sin casilla de «leído», sin «completo» |
| 22 | onboarding not HR | **PASS** | prueba E1 sobre las tres capas |
| 23 | onboarding privacy | **PASS** | escenario E2 en base real: el consultor obtiene `null` |
| 24 | onboarding PDF | **PASS** | `quality.onboarding.detail` |
| 25 | PDF corporate header | **PASS** | prueba L1: 45 documentos, encabezado página a página |
| 26 | PDF export inventory 0 pending | **PASS** | prueba K3/K4 |
| 27 | evaluation context route/panel | **PASS** | `/quality/people/performance/[evaluationId]`, desplegada |
| 28 | operational context by real relations | **PASS** | siete fuentes, cada una por su relación |
| 29 | Position bridge | **PASS** | prueba F2 + escenario C2 |
| 30 | period-aware | **PASS** | escenario C5: la medición posterior no entra |
| 31 | historical truth | **PASS** | escenario B2/B4 y marcado «Estado actual» donde no se puede |
| 32 | no employee attribution | **PASS** | escenario C3: ninguna línea nombra a la persona como sujeto |
| 33 | positive/negative neutral context | **PASS** | escenario C6 |
| 34 | explicit informational disclaimer | **PASS** | en pantalla y en papel (prueba F1) |
| 35 | no operational score | **PASS** | escenario C4 y prueba F3 |
| 36 | no employee ranking | **PASS** | no hay orden ni agregación; el resumen cuenta hechos por tono |
| 37 | no auto result mutation | **PASS** | escenario D1: corregir 82→20 deja la evaluación idéntica |
| 38 | human evaluation preserved | **PASS** | escenario D3 y prueba I3 |
| 39 | context respects source permissions | **PASS** | misma sesión; se dice cuántas fuentes faltan, no cuáles |
| 40 | evaluation privacy preserved | **PASS** | escenario E1 |
| 41 | evaluation PDF separation | **PASS** | prueba L2: el contexto no está en la página del resultado |
| 42 | cross-tenant onboarding denied | **PASS** | escenario F1 |
| 43 | cross-tenant context denied | **PASS** | escenario F2 |
| 44 | arbitrary organization ignored/denied | **PASS** | escenario F3 |
| 45 | no service_role normal path | **PASS** | prueba F5 sobre las dos capas |
| 46 | no migration | **PASS** | prueba A1 |
| 47 | Local stays 0124 | **PASS** | cabecera local 0124 |
| 48 | Staging stays 0124 | **PASS** | `migration list`: 116 entradas, cero desalineadas |
| 49 | Production stays 0111 | **PASS** | ningún comando contra Production; nada pudo cambiarla |
| 50 | Q06 regression | **PASS** | `test:quality06` 77/77 y `test:quality06-rls` 58/58 en Staging |
| 51 | Export regression | **PASS** | export01 54/54 · export011 31/31 · export012 · export013 34/34 |
| 52 | PCR regression | **PASS** | en `test:all` |
| 53 | Textiles regression | **PASS** | en `test:all` |
| 54 | TrazaDocs regression | **PASS** | en `test:all` |
| 55 | Auth/team regression | **PASS** | en `test:all` |
| 56 | QA invariant | **PASS** | las 4 cuentas QA de Staging intactas |
| 57 | test:all exit 0 | **PASS** | `TEST_ALL_EXIT_REAL=0` |
| 58 | Staging scenarios green | **PASS** | 28/28 contra Staging |
| 59 | Preview points Staging | **PASS** | `env pull` resuelve a Staging; 0 referencias a Production |
| 60 | Preview Ready | **PASS** | ● Ready, target `preview`, SSO 302, dos rutas nuevas en el build |
| 61 | Production untouched | **PASS** | sin migración, sin datos, sin env, sin despliegue |
| 62 | repo remote-unlinked | **PASS** | sin `supabase/.temp/project-ref`; siempre `--project-ref` |
| 63 | tree clean | **PASS** | verificado al cierre |
| 64 | push normal | **PASS** | sin force, sin rebase destructivo |
| 65 | **GAP onboarding = CLOSED** | **PASS** | pantalla, PDF, tres entradas y siete escenarios en base real |
| 66 | **GAP context = CLOSED** | **PASS** | panel, sección de PDF, prueba negativa y separación física |

**Recuento: 66 PASS · 0 GAP · 0 FAIL.**

### Los dos gaps de QUALITY-06

| Gap | Estado |
|---|---|
| GAP-1 · PC-10, onboarding QMS sin pantalla propia | **CERRADO** |
| GAP-2 · PC-28, contexto operacional de la evaluación | **CERRADO** |

PC-10 pasa de `PARTIAL` a `IMPLEMENTED` en la matriz de QUALITY-06; PC-28 se
mantiene `IMPLEMENTED` y ahora la parte de *ayuda al evaluador* también existe.
El addendum está en `docs/quality/quality-06/QUALITY_06_ADDENDUM_06_1.md`.

---

## Veredicto

**QUALITY-06.1 READY FOR USER TESTING**
