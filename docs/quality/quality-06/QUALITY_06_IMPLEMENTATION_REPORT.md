# QUALITY-06 · Informe de implementación

Personas · Cargos · Competencias · Desarrollo · Conocimiento

---

## A · Rama

`feature/quality-06-people-competence-knowledge`, creada desde el baseline
oficial y empujada con push normal. Sin merge commit, sin cherry-pick, sin
rebase, sin force push.

## B · HEAD

Baseline `6a3f40b` → implementación `6d1ea5c` → entregables (este commit).

## C · Commits

Dos: uno de implementación y uno de documentación. El de implementación cuenta,
en su propio cuerpo, las cuatro separaciones que sostienen el dominio y por qué
el guardián de 0112 tuvo que evolucionar.

## D · Baseline

`baseline/quality-05-post-export` creada **exactamente** en `6a3f40b` y
empujada. Verificado: `git rev-parse baseline/quality-05-post-export` = `6a3f40b`.
Contiene QUALITY-01…05 y EXPORT-01…01.3, y el árbol estaba limpio al partir.

## E · Migraciones

| | |
|---|---|
| `0123_quality_people_competence_knowledge.sql` | 3 883 líneas · 26 tablas · 5 vistas · 20 funciones · RLS completa |
| `0124_quality_people_tasks_from_sweep.sql` | reescribe el barrido para que además genere **tareas** |

Append-only. No se editó ninguna migración anterior, no se ejecutó
`migration repair` y no se borró ni renombró ninguna tabla previa.

Por qué dos y no una: cuando 0123 ya estaba aplicada a Staging, la revisión de
§68 mostró que el barrido emitía alertas pero ninguna tarea, así que «integrar
las tareas generadas» no tenía nada que integrar. Corregirlo editando 0123
habría exigido un `repair` prohibido. 0124 no crea esquema.

## F · Discovery

Se auditó el repositorio antes de escribir esquema. Resultado completo en
`QUALITY_06_DATA_MODEL.md` §0. En corto:

| | |
|---|---|
| **REUSE** | `quality_positions`, `work_tasks`, `work_alerts`, `work_events`, `work_decisions`, `work_references`, motor de exportación, TrazaDocs, Storage |
| **EVOLVE** | `quality_position_assignments` (apuntaba solo a cuentas), `quality_positions` (unidad, jerarquía, criticidad), `quality_positions.org_unit` texto → `quality_org_units` |
| **CREATE** | Persona, unidades, versiones y funciones de cargo, competencia, desarrollo, desempeño, conocimiento, lecciones |
| **ADAPT** | `v_quality_position_current_holder` de 0112, para que lea el nombre de la persona |
| **DEFER** | Copiloto/IA (§83), importador de CV (§41, §82), actividades de proceso |

## G · Modelo

26 tablas nuevas y 5 vistas derivadas. Ninguna tabla de «organigrama» ni de
«matriz»: las dos son proyecciones. Detalle en `QUALITY_06_DATA_MODEL.md`.

## H · Unidades organizacionales

`quality_org_units` con jerarquía opcional y ciclo prohibido por disparador. Las
unidades **no** son obligatorias: una empresa puede funcionar con una y varios
cargos, y el organigrama sigue saliendo porque el texto libre de 0112 se conserva
como respaldo.

## I · Cargos

Evolucionados, no recreados. Conservan sus identificadores, su ciclo de vida, su
borrado seguro de QUALITY-03.1a y su propiedad sobre procesos, documentos,
indicadores, objetivos y riesgos. Ganan unidad, cargo superior y criticidad, más
un perfil versionado con funciones estructuradas.

## J · Personas

`quality_people` con lo mínimo del SGC. Sin salario, banco, salud, religión,
orientación sexual, familia ni disciplina — y esa lista vive como dato, con una
prueba que la comprueba contra el esquema real.

## K · Asignaciones

Temporales, con `effective_from`/`effective_to`. Cerrar una no la sobrescribe.
Un cargo admite varios ocupantes simultáneos (`co_holder`) y **un solo titular
vigente**, que se declara y no se adivina.

## L · Cargos históricos

`quality_position_holders_on(empresa, cargo, fecha)`. El escenario 1 lo prueba
contra base real: la fecha de Ana devuelve Ana, la de Carlos devuelve Carlos, y
la vista de vigentes devuelve Carlos sin haber tocado la fila de Ana.

## M · Competencias

Catálogo reutilizable + escala configurable por empresa. Se ofrece una escala de
partida, no se impone.

## N · Requisitos

Cuelgan de la **versión** del perfil (o de un proceso). Esa decisión es la que
hace que PC-23 se cumpla por construcción.

## O · Competencia demostrada

Decisión con nivel, método, fundamento, autor y fecha. Se **sustituye**, no se
reescribe: la anterior queda `superseded` y enlazada.

## P · Evidencia

Ocho tipos, vencimiento opcional, enlace a TrazaDocs. Reutiliza el motor de
referencias; no hay un segundo almacén de archivos para Personas.

## Q · Brechas

Se calculan, se explican y no se guardan. La matriz muestra requerido,
demostrado, brecha y estado de la evidencia en columnas separadas. No suma, no
promedia y no ordena personas.

## R · Desarrollo

Nueve tipos, y solo uno es un curso. Necesidad con origen, plan anual vivo con
fecha y motivo de entrada por item, actividad ejecutada con sus fechas reales.

## S · Aprendizaje

Asistencia y aprendizaje en columnas distintas. «No se evalúa» es una respuesta
legítima. Ninguna acción rellena una columna al escribir la otra.

## T · Eficacia

Criterio declarado antes de juzgar; método declarado; resultado que puede ser
«no eficaz» y que entonces **no se puede reescribir**.

## U · Evaluación de desempeño

Ciclo con periodo y **población declarada**. La evaluación exige evaluador y al
menos un criterio escrito para poder cerrarse. No toca la competencia de nadie.
No hay puntaje, promedio ni ranking en ninguna capa.

## V · Conocimiento

Explícito, tácito o mixto; criticidad y estado de documentación. Existe aunque
no haya documento. Quien lo tiene es **holder**, con titular principal explícito.

## W · Continuidad

Señal idempotente cuando un conocimiento crítico depende de una persona o de
ninguna, más una tarea de revisión. Cero no conformidades y cero riesgos
automáticos. Promover a riesgo es humano y queda firmado.

## X · Lecciones aprendidas

Cuatro columnas separadas. Las propuestas se deciden y se registra **qué se
creó**; aceptar no cambia nada por su cuenta.

## Y · Onboarding / offboarding

Offboarding completo: informe de lo que queda descubierto, mostrado **antes** de
cerrar la puerta, y desvinculación que conserva todo. Onboarding: los datos son
derivables pero falta la vista que los reúna — declarado como *gap* real.

## Z · Alertas y tareas

Se reutilizan `work_alerts` y `work_tasks`. Ocho tipos de alerta y ocho de tarea
nuevos, todos idempotentes por `dedupe_key` y todos con etiqueta legible y enlace
correcto en «Mis tareas». Ninguno crea una acción del SGC por su cuenta.

## AA · Privacidad

Tres círculos —estructura, ficha de persona, desempeño— implementados en RLS y
no en la pantalla. Sin rol «HR» inventado. Detalle en
`QUALITY_06_PRIVACY_AND_RLS.md`.

## AB · RLS

Toda tabla nueva enciende RLS, declara políticas y **revoca** los privilegios
heredados antes de conceder lo que necesita. `anon` no recibe nada. Las cinco
vistas son `security_invoker`.

## AC · Ataques directos

Bloques J y K de la suite en base real: lectura y escritura cross-tenant por
PostgREST, por UUID conocido, por vistas, por relaciones cruzadas, por RPC y por
funciones `security definer`. Todo rechazado o vacío.

## AD · Exportaciones

21 claves nuevas, todas por el endpoint único, todas con su nombre documental en
el registro. Entidades Q06 con export pendiente: **0**.

## AE · PDF

Encabezado corporativo de EXPORT-01.2 en todas las páginas y normalización de
logo de 01.3, heredados sin tocar nada. La suite renderiza un organigrama de 144
cargos y una matriz de 60 filas y comprueba el encabezado página a página.

## AF · PC-01…PC-28

`QUALITY_06_PC_MATRIX.md`: 24 `IMPLEMENTED`, 1 `PARTIAL` (PC-10, onboarding sin
pantalla), 2 `NOT APPLICABLE` en este sprint por decisión del encargo (PC-12,
PC-26), y PC-27 implementado por arquitectura.

## AG · Pruebas

| | |
|---|---|
| `npm run test:quality06` | 77 conformes, 0 fallos |
| `npm run test:quality06-rls` (local) | 58 conformes, 0 fallos |
| `npm run test:quality06-rls` (Staging) | 58 conformes, 0 fallos |

Detalle y los cinco defectos que estas pruebas encontraron:
`QUALITY_06_TEST_MATRIX.md`.

## AH · Regresiones

```
npm run test:all
TEST_ALL_EXIT_REAL=0
```

## AI · Staging

Cabecera **0124**, paridad completa, 26 tablas, RLS en todas, `anon` sin nada,
vistas `security_invoker`, suite en verde y datos efímeros retirados. Detalle en
`QUALITY_06_STAGING_VALIDATION.md`.

## AJ · Preview

`https://trazaloop-production-4c0vivc60-idendi-latam-s-projects.vercel.app`
· target `preview` · ● Ready · SSO activo (302) · tres variables **solo** en
scope Preview y **solo** en esta rama, apuntando a Staging.

## AK · Production

**Sin tocar.** Ninguna migración, dato, usuario, semilla, variable, despliegue,
promoción ni alias.

**Corrección de un dato del encargo:** el encargo afirma «Production sigue en
0122». La cabecera remota real es **0111**: QUALITY-01…05 nunca se aplicaron
allí. Lo que el encargo pide —que este sprint no toque Production— se cumple.

## AL · Gaps reales

**Functional gaps** (se construyen sobre lo que este sprint deja, sin rediseñar
nada):

1. **Onboarding sin pantalla propia.** El perfil publicado, la matriz y el
   conocimiento ya dicen qué necesita saber quien entra a un cargo; falta la
   vista que lo reúna al asignarlo.
2. **Panel de contexto operacional en la evaluación.** El encargo dice que los
   datos de indicadores y casos *pueden ayudar al evaluador*: esa ayuda no está
   construida. La prohibición —que no calculen el resultado— sí está.

**Architecture gap:**

3. **Actividades de proceso.** El modelo de actividad dentro de un proceso no
   existe en la plataforma; requisitos y funciones se enlazan al proceso, que es
   el nivel disponible. El esquema ya admite el enlace por actividad el día que
   ese modelo exista.

**Fuera de alcance por decisión del encargo** (no son gaps): copiloto/IA (§83),
importación de CV (§41), importador masivo (§82).

**Limitación honesta, no gap:** la protección de despliegue de Vercel impide una
comprobación anónima en tiempo de ejecución del Preview. La prueba de que apunta
a Staging es de configuración —resuelta por la propia plataforma para esta
rama— no una petición a una página protegida.

## AM · Checklist humano

`QUALITY_06_HUMAN_CHECKLIST.md`.

---

## Los 113 criterios de cierre

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| 1 | baseline oficial creado correctamente | **PASS** | `baseline/quality-05-post-export` = `6a3f40b`, empujada |
| 2 | Q06 branch correcta | **PASS** | creada desde el baseline; sin merge, rebase ni cherry-pick |
| 3 | repo discovery realizado | **PASS** | `DATA_MODEL` §0, con REUSE/EVOLVE/CREATE/ADAPT/DEFER |
| 4 | Q01 positions reutilizadas | **PASS** | prueba A3: no existe `create table quality_positions` en 0123 |
| 5 | Position ≠ Person | **PASS** | tablas distintas + escenario 1 |
| 6 | Person ≠ User | **PASS** | `profile_id` opcional y único por empresa |
| 7 | Person sin User posible | **PASS** | escenario A1 en base real: Carlos existe sin cuenta |
| 8 | Position sin Person posible | **PASS** | cargo crítico vacante genera aviso, no error |
| 9 | asignaciones temporales | **PASS** | `effective_from`/`effective_to` |
| 10 | múltiples asignaciones históricas | **PASS** | escenario A2: dos filas conviven |
| 11 | no First() ambiguo | **PASS** | `primaryHolder()` + prueba A5/A6 |
| 12 | unidades estructuradas | **PASS** | `quality_org_units` con jerarquía y anticiclo |
| 13 | organigrama derivado | **PASS** | `v_quality_org_chart`; no hay columna de imagen |
| 14 | versiones de cargo | **PASS** | `quality_position_versions` + RPC de publicación |
| 15 | funciones estructuradas | **PASS** | `quality_position_functions` con tipo |
| 16 | funciones→proceso/actividad donde posible | **PASS** | `process_id`; actividad no existe en el modelo |
| 17 | competencias reutilizables | **PASS** | catálogo por empresa, exigido desde el perfil |
| 18 | niveles estructurados | **PASS** | `quality_competency_levels` configurable |
| 19 | requisitos por cargo | **PASS** | vía versión del perfil |
| 20 | requisitos por actividad donde posible | **PASS** | `process_id` XOR `position_version_id` |
| 21 | requisitos históricos preservados | **PASS** | escenario 2 + `quality_required_level_on` |
| 22 | competencia demostrada separada | **PASS** | tabla propia con método y fundamento |
| 23 | evidencia competencia | **PASS** | ocho tipos + `work_references` |
| 24 | expiración evidencia | **PASS** | `expires_on` opcional; barrido |
| 25 | expiración ≠ incompetencia automática | **PASS** | escenario E4: nivel y estado intactos |
| 26 | matriz competencias | **PASS** | vista + pantalla + dos PDF |
| 27 | gap automático explicable | **PASS** | `competenceGap` puro, columnas separadas |
| 28 | gap ≠ capacitación obligatoria | **PASS** | escenario 3 con práctica supervisada |
| 29 | necesidad desarrollo | **PASS** | con diez orígenes posibles |
| 30 | plan anual | **PASS** | único por año y empresa |
| 31 | actualizaciones continuas | **PASS** | `added_on`/`added_reason` y PDF en dos bloques |
| 32 | desarrollo ≠ training | **PASS** | nueve tipos; prueba E1 |
| 33 | learning activity | **PASS** | con fechas reales y estado |
| 34 | participante | **PASS** | 1:N por actividad |
| 35 | attendance separate | **PASS** | columna propia; escenario C2 |
| 36 | learning separate | **PASS** | columna propia con «no se evalúa» |
| 37 | competence separate | **PASS** | vive en la ficha de la persona |
| 38 | effectiveness separate | **PASS** | tabla propia con criterio previo |
| 39 | ineffective preserved | **PASS** | escenario D2: no se puede reescribir |
| 40 | evaluation cycle annual | **PASS** | `quality_performance_cycles` |
| 41 | applicable population | **PASS** | `_cycle_members` declarada |
| 42 | performance ≠ competence | **PASS** | prueba C2 + escenario F4 |
| 43 | human final evaluation | **PASS** | RPC exige evaluador y criterios |
| 44 | no employee auto ranking | **PASS** | pruebas C3/C4/L6 |
| 45 | operational data only context | **PASS** | `context_note` humano; nada calcula |
| 46 | knowledge item | **PASS** | objeto propio |
| 47 | explicit/tacit/mixed | **PASS** | los tres, con prueba |
| 48 | holder relation | **PASS** | `_holders` con vigencia |
| 49 | single-holder signal | **PASS** | escenario G1 |
| 50 | person not modeled as risk | **PASS** | prueba H3 sobre los textos |
| 51 | no automatic formal risk | **PASS** | escenario G2: 0 casos, 0 riesgos |
| 52 | transfer plan | **PASS** | con verificación aparte |
| 53 | lessons learned | **PASS** | cuatro columnas |
| 54 | lesson can propose system changes | **PASS** | `quality_lesson_proposals` |
| 55 | no automatic system change | **PASS** | escenario I2: nada cambió |
| 56 | onboarding QMS | **GAP** | datos derivables; falta la vista que los reúna |
| 57 | offboarding QMS | **PASS** | informe + pantalla + escenario 9 |
| 58 | historical responsibility | **PASS** | escenario 1 y `HISTORICAL_TRUTH` |
| 59 | Person privacy | **PASS** | bloque J en base real |
| 60 | evaluation privacy | **PASS** | J4: el consultor no ve ni las líneas |
| 61 | cross-tenant Person denied | **PASS** | K1 |
| 62 | cross-tenant evaluation denied | **PASS** | K1 |
| 63 | cross-tenant knowledge denied | **PASS** | K1/K2 |
| 64 | same-org relationship guards | **PASS** | K5/K6 |
| 65 | direct PostgREST attacks denied | **PASS** | K3/K4/K7/K8/K10 |
| 66 | alerts idempotent | **PASS** | escenario E3 y prueba J6 |
| 67 | tasks reused | **PASS** | `work_tasks` ensanchado; 0124 las genera |
| 68 | no duplicate action engine | **PASS** | prueba J1; nada inserta en `work_actions` |
| 69 | Quality Home useful | **PASS** | cinco señales, sin datos personales |
| 70 | Mis tareas deep links | **PASS** | ocho tipos con destino correcto (prueba J3) |
| 71 | lifecycle/hard delete safe | **PASS** | cuatro veredictos nuevos |
| 72 | no history deletion | **PASS** | prueba M4 + escenario H4 |
| 73 | PDF Person | **PASS** | `quality.person.detail` |
| 74 | PDF organigrama | **PASS** | `quality.orgchart.detail`, multipágina |
| 75 | PDF competence matrix | **PASS** | vigente e histórica |
| 76 | PDF development plan | **PASS** | con previsto/incorporado |
| 77 | PDF learning/effectiveness | **PASS** | dos documentos |
| 78 | PDF performance evaluation | **PASS** | con permiso comprobado |
| 79 | PDF knowledge | **PASS** | ficha, listado y transferencia |
| 80 | PDF lesson | **PASS** | ficha y listado |
| 81 | PDF header all pages | **PASS** | bloque O de la suite |
| 82 | logo normalization regression | **PASS** | `test:export013` 34/34 |
| 83 | export pending Q06 = 0 | **PASS** | inventario: 0 pendientes |
| 84 | PDF permissions enforced | **PASS** | adaptadores leen por RLS; 404 si no |
| 85 | PC-01…28 matrix complete | **PASS** | `QUALITY_06_PC_MATRIX.md` |
| 86 | local scenario position history | **PASS** | escenario 1 |
| 87 | local competence version scenario | **PASS** | escenario 2 |
| 88 | development scenario | **PASS** | escenario 3 |
| 89 | ineffective scenario | **PASS** | escenario 5 |
| 90 | certification expiry scenario | **PASS** | escenario 6 |
| 91 | annual evaluation scenario | **PASS** | escenario 7 |
| 92 | knowledge concentration scenario | **PASS** | escenario 8 |
| 93 | offboarding scenario | **PASS** | escenario 9 |
| 94 | lesson scenario | **PASS** | escenario 10 |
| 95 | RLS suite green | **PASS** | 58/58 local y Staging |
| 96 | Quality regressions green | **PASS** | quality01…06 en `test:all` |
| 97 | Export regressions green | **PASS** | export01…013 |
| 98 | PCR regression | **PASS** | en `test:all` |
| 99 | Textiles regression | **PASS** | en `test:all` |
| 100 | TrazaDocs regression | **PASS** | en `test:all` |
| 101 | Auth/team regression | **PASS** | en `test:all` |
| 102 | QA invariant | **PASS** | 4 cuentas QA intactas en Staging |
| 103 | test:all exit 0 | **PASS** | `TEST_ALL_EXIT_REAL=0` |
| 104 | migration append-only | **PASS** | 0123 y 0124; nada anterior tocado |
| 105 | Staging migration correct | **PASS** | paridad total, cabecera 0124 |
| 106 | Staging real scenarios green | **PASS** | 58/58 contra Staging |
| 107 | Preview targets Staging | **PASS** | `env pull` resuelve a Staging; 0 referencias a Production |
| 108 | Preview Ready | **PASS** | ● Ready, target `preview`, SSO 302 |
| 109 | Production remains 0122 | **GAP (dato del encargo)** | Production está en **0111**, no 0122. Sin tocar por este sprint |
| 110 | Production untouched | **PASS** | solo una lectura de `migration list` |
| 111 | repo remote-unlinked | **PASS** | sin `supabase/.temp/project-ref`; se usó `--project-ref` |
| 112 | tree clean | **PASS** | verificado al cierre |
| 113 | push normal | **PASS** | sin force, sin rebase destructivo |

**Recuento: 111 PASS · 2 GAP · 0 FAIL.**

Los dos GAP son de naturaleza distinta y ninguno es un fallo de implementación:
el 56 es funcionalidad que falta (onboarding sin pantalla propia) y el 109 es un
dato del encargo que no coincide con la realidad del entorno.

---

## Veredicto

**QUALITY-06 PEOPLE, COMPETENCE & KNOWLEDGE READY FOR USER TESTING**
