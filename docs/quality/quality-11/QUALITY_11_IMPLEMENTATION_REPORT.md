# QUALITY-11 · Informe consolidado

## A · Rama

`feature/quality-11-automation-observation`

## B · HEAD

`43433d4` en el momento de cerrar los entregables, más este último commit de
sellado.

## C · Commits

| Commit | Qué |
|---|---|
| `eacaa0d` | QUALITY-11 · automatización determinística, señales y observación transversal |
| `43433d4` | entregables de QUALITY-11 |
| *(este)* | sellado: HEAD, URL de Preview y veredicto |

## D · Baseline

`baseline/quality-10-post-acceptance` = `e0d0e71` — la última de QUALITY-10, con
su Preview ya registrado. La rama parte exactamente de ahí.

## E · Migraciones

| Migración | Líneas | Qué |
|---|---|---|
| `0129_quality_automation_observation.sql` | 3 388 | el dominio entero |
| `0130_quality_automation_scheduled_observers.sql` | 443 | corrección posterior a Staging: un barrido heredado que exige sesión se omite, no falla |

Append-only. La 0129 no se editó después de llegar a Staging.
**Local 0130 · Staging 0130 · Production 0111.**

## F · Descubrimiento

Antes de escribir nada se buscó todo lo que ya observaba: ocho barridos
(`quality_scan_*`, `work_scan_pending_actions`), tres mecanismos transversales
(`work_events`, `work_alerts`, `work_tasks`), el ciclo de vida
(`quality_deletion_eligibility`, 21 entidades) y el registro de exportaciones
(158 claves). Nada de eso se duplicó.

También se buscó lo que **no** existía: ninguna infraestructura de tareas
programadas, y ninguna columna de zona horaria por empresa en todo el esquema.
Las dos ausencias condicionaron el diseño (§T, §I).

## G · Inventario de barridos anteriores

En `QUALITY_11_OLD_SWEEP_INVENTORY.md`. Ocho mecanismos, ocho **integrados**
como observadores de plataforma con su contrato público intacto. Cero
reescritos, cero duplicados.

## H · Modelo de eventos

`work_events` + 5 tipos nuevos, todos en pasado. Evento ≠ estado actual.
Detalle en `QUALITY_11_EVENT_MODEL.md`.

## I · Modelo de observación

Un proveedor de sujetos por fuente, 18 ramas escritas a mano, hechos
materializados en `jsonb`. Observar no escribe nada. El día de negocio se
resuelve **una vez** por barrido, en la zona horaria de la empresa.

## J · Modelo de señal

El hecho detectado, con regla, versión, ejecución, sujeto, gravedad,
explicación y retrato mínimo. Origen congelado por disparador. Se reconoce, se
resuelve o se silencia; nunca se borra.

## K · Modelo de regla

Identidad estable en `quality_automation_rules`; contenido en versiones. Cuatro
estados, cuatro niveles de autonomía, un cargo responsable.

## L · Versionado

Publicada exige validación y fecha de vigencia. La anterior queda `superseded`
con su ventana cerrada el día antes. **La versión que gobierna hoy es la que
tiene hoy dentro de su ventana**, no la que lleva la etiqueta más nueva: sin eso,
publicar un relevo para mañana dejaba a la regla sin versión durante un día
entero en cuanto el día de negocio de la empresa no coincidía con el del
servidor.

## M · Catálogo de fuentes

18 fuentes · 70 campos · 6 tipos de dato. Global, de solo lectura, sin nombres
de tabla ni de columna. `QUALITY_11_SOURCE_CATALOG.md`.

## N · Operadores

Catorce, cerrados, acotados por campo. Los dos que hacen el trabajo difícil sin
IA: `consecutive_count` («lleva tres periodos fuera de meta») y
`strictly_decreasing` («va empeorando»).

## O · Evaluador

`AND` entre condiciones, sin `OR` —«A o B» son dos reglas—. Inmutable. Falla
cerrada ante cualquier dato con forma inesperada, y explica por qué. Lista vacía
de condiciones **no coincide**.

## P · Simulación

El mismo motor con otro modo. Cuenta coincidencias, devuelve hasta diez
ejemplos y **no escribe nada** — garantizado también por una restricción de la
tabla de ejecuciones. Exige sesión.

## Q · Salidas

Tres: señal, aviso, tarea. La señal va primera. Cualquier otra se rechaza en la
validación. `QUALITY_11_OUTPUT_MODEL.md`.

## R · Idempotencia

Índice único **parcial** sobre la señal abierta + `on conflict … where` +
`xmax = 0`. Aviso y tarea, con su propia clave por señal y perfil.
`QUALITY_11_IDEMPOTENCY.md`.

## S · Recurrencia

El predicado parcial libera la clave al resolver: la condición **se rearma**. Ni
dedupe eterno, ni duplicado.

## T · Planificador

Endpoint con secreto compartido que llama al mismo motor. **No se configuró
ningún cron**: hacerlo habría exigido tocar `vercel.json`, que es configuración
compartida con Production. Se aplicó §163: invocación verificada contra Staging
y paso de despliegue declarado. `QUALITY_11_SCHEDULER.md`.

## U · Prevención de bucles

Ninguna fuente observa tareas, avisos, señales ni ejecuciones. El grafo tiene
profundidad uno **por construcción**: no hay recursión que acotar. Comprobado
también por la vía empírica: cinco barridos seguidos, cero tareas de más.

## V · Explicabilidad

Cada condición devuelve su frase con el valor observado; la señal nace con la
regla, la versión, el sujeto, la condición y la fecha; el retrato guarda solo
los campos que se miraron.

## W · Cobertura por dominio

Los diez dominios, 18 fuentes, 14 plantillas.
`QUALITY_11_DOMAIN_COVERAGE.md`.

## X · Cruce de dominios

`supplier_critical_reevaluation_overdue`: criticidad (QUALITY-05 → QUALITY-07) ×
fecha de reevaluación (QUALITY-07). Verificado con datos reales y con la
aprobación del proveedor intacta.

## Y · Compatibilidad con los barridos anteriores

Los ocho conservan firma, comportamiento y valor de retorno. Las suites de
QUALITY-03…10 pasan sin cambiar una línea.

## Z · Privacidad

Retrato mínimo, sin datos personales en el catálogo, sin vigilancia de personas.
`QUALITY_11_PRIVACY.md`.

## AA · Anonimato

La fuente de voz del cliente observa **la campaña** y lee agregados. Verificado
con una campaña anónima real: fuga de identidad = 0. Y la suite de QUALITY-08
corrió contra Staging: 60 conformes.

## AB · Seguridad

Sin SQL dinámico en el censo ni en el evaluador. Sin `service_role` fuera del
planificador. Fallo cerrado en todos los caminos.
`QUALITY_11_SECURITY_RLS.md`.

## AC · RLS

Siete tablas con RLS; ejecuciones de solo lectura; señales solo `update`;
catálogos globales de solo lectura. `anon` sin nada.

## AD · Ataques

Los once de §152, cerrados y comprobados. Tabla completa en
`QUALITY_11_SECURITY_RLS.md` §4.

## AE · Rendimiento

×10 sujetos → ×7,2 coste. ×3 reglas → ×1,6 coste. Sin N+1.
`QUALITY_11_PERFORMANCE.md`.

## AF · Experiencia de uso

Cuatro pantallas: Resumen, Reglas, Señales, Ejecuciones. El constructor ofrece
campos del catálogo, nunca un cuadro de texto. La descripción de la regla se
genera en castellano antes de publicar, y se puede **simular**. El inicio de
Calidad consolida en una tarjeta lo que requiere atención.

## AG · Exportaciones

Seis claves, `Q11_EXPORT_PENDING = 0`, once entidades clasificadas.
`QUALITY_11_EXPORT_COVERAGE.md`.

## AH · PDFs

Listado y ficha de regla —con **todas** sus versiones—, listado y ficha de
señal —con su explicación y su retrato—, listado e informe de ejecución —con
alcance, tiempos, reglas, sujetos, coincidencias, salidas y fallos, y ningún
secreto—.

## AI · AT-01…AT-45

**45 IMPLEMENTED · 0 PARTIAL · 0 DEFERRED · 0 NOT_APPLICABLE.**
`QUALITY_11_AT_MATRIX.md`.

## AJ · Pruebas

```
test:quality11        129 conformes, 0 fallos
test:quality11-rls     68 conformes, 0 fallos   (local y contra Staging)
test:quality11-perf     6 conformes, 0 fallos
```

Ocho defectos encontrados, seis por la suite contra base real.
`QUALITY_11_TEST_MATRIX.md`.

## AK · Regresiones

`npm run test:all` → **EXIT 0**. Las quince suites contra base real, verdes.
`quality01-rls` estaba en rojo desde QUALITY-10 y se corrigió.

## AL · Staging

`0130`, paridad exacta, seis dominios sembrados, segundo barrido con **0
duplicados**, datos efímeros retirados lógicamente.
`QUALITY_11_STAGING_VALIDATION.md`.

## AM · URL de Preview

`https://trazaloop-production-k5yxke1b5-idendi-latam-s-projects.vercel.app`

## AN · Production intacta

Cabecera **0111**. Sin migración, datos, usuarios, semillas, cron,
planificador, variables, despliegue, promoción, alias ni webhook.

## AO · GAPS

**GAP-01 · Dos barridos heredados no corren bajo el planificador.**
`quality_scan_pending_measurements` (QUALITY-03) y `work_scan_pending_actions`
(QUALITY-04) se escribieron como acciones de pantalla y exigen sesión. Bajo el
barrido programado se anotan como **omitidos con motivo** (0130) y sus
condiciones —mediciones pendientes y acciones vencidas— solo se barren cuando
alguien dispara la automatización a mano.
*Cómo se cierra:* o se relaja su guarda en QUALITY-03/04 con el patrón que usan
los otros seis, o la empresa activa una regla de QUALITY-11 equivalente
(`indicator.measurement_pending`, `action.due_on`) y deja de usarlos. Lo segundo
se puede hacer hoy, sin migración. No se hizo aquí porque tocar el contrato de
esos dos barridos es trabajo de sus sprints, no de este (§127).

**GAP-02 · El disparo por evento queda declarado, no ejercitado.**
`trigger_kind = 'event'` y `event_types` existen en el modelo y el evaluador es
el mismo, pero las 14 plantillas y todas las pruebas usan el camino programado.
Es deliberado: el camino programado es el que resuelve «vence dentro de 30
días», que es la mayoría de lo que un SGC necesita observar.
*Cómo se cierra:* un disparador sobre `work_events` que llame al motor con la
regla afectada. No se hizo porque exige decidir antes qué eventos merecen
reacción inmediata, y esa es una decisión de producto que este sprint no tenía
encargada.

**Ninguno de los dos afecta a un AT.**

## AP · Guion de prueba humana

22 pasos, en `QUALITY_11_HUMAN_CHECKLIST.md`.

---

# Los 167 criterios de cierre (§180)

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| 1 | baseline Q10 correcta | **PASS** | `baseline/quality-10-post-acceptance` = `e0d0e71` |
| 2 | rama Q11 correcta | **PASS** | `feature/quality-11-automation-observation` |
| 3 | descubrimiento completo | **PASS** | §F |
| 4 | AT leídos como base | **PASS** | `QUALITY_11_AT_MATRIX.md` |
| 5 | sin motor de alertas duplicado | **PASS** | `work_alerts` · prueba E3, L6 |
| 6 | sin motor de tareas duplicado | **PASS** | `work_tasks` · prueba E4, L6 |
| 7 | sin motor de acciones duplicado | **PASS** | el motor no escribe en `work_actions` · E5 |
| 8 | sin bitácora duplicada | **PASS** | `work_events` · E1, L6 |
| 9 | evento ≠ estado actual | **PASS** | §H · prueba P6 |
| 10 | evento de negocio inmutable | **PASS** | disparador de 0118, intacto |
| 11 | camino por evento | **PARCIAL** | modelo presente, no ejercitado · **GAP-02** |
| 12 | camino de observación programada | **PASS** | escenarios 1…8 · prueba V1 |
| 13 | evaluador determinístico | **PASS** | `immutable` · prueba D6 |
| 14 | regla ≠ IA | **PASS** | prueba Q1 |
| 15 | catálogo de fuentes tipado | **PASS** | 18/70 · pruebas A1–A4 |
| 16 | sin SQL arbitrario | **PASS** | prueba A6, A7 |
| 17 | sin tabla arbitraria | **PASS** | prueba A1, A5 |
| 18 | sin columna arbitraria | **PASS** | prueba A1, A5 |
| 19 | operadores seguros | **PASS** | 14 acotados por campo · prueba D1 |
| 20 | validación de la regla | **PASS** | pruebas B3, B4, R4, R5, R6 |
| 21 | identidad estable de la regla | **PASS** | prueba B1 |
| 22 | versionado | **PASS** | pruebas B2, B5, F1–F3 |
| 23 | versión publicada inmutable | **PASS** | disparador · prueba F1 |
| 24 | activa ≠ publicada | **PASS** | pruebas C1, C2 |
| 25 | fechas de vigencia | **PASS** | §L · prueba C2 |
| 26 | desactivar conserva historia | **PASS** | prueba U3 |
| 27 | responsable = cargo | **PASS** | `owner_position_id` · FK compuesta |
| 28 | actor = persona/usuario | **PASS** | `triggered_by`, `published_by`, `resolved_by` |
| 29 | destinatario estructural | **PASS** | prueba M8 · escenario 1 |
| 30 | persona sin cuenta contemplada | **PASS** | `recipient_unresolved` · prueba M9 |
| 31 | varios titulares contemplados | **PASS** | se avisa a todos · `quality_automation_recipients` |
| 32 | semántica de observación | **PASS** | §I · prueba E2 |
| 33 | señal transversal | **PASS** | 6 dominios con señal en Staging |
| 34 | señal ≠ alerta | **PASS** | prueba E3 |
| 35 | alerta ≠ tarea | **PASS** | prueba E4 |
| 36 | tarea ≠ acción | **PASS** | prueba E5 · escenario 2 |
| 37 | sin NC automática | **PASS** | escenario 6 · prueba K1 |
| 38 | sin aprobación automática de proveedor | **PASS** | escenario 4 |
| 39 | sin decisión automática de competencia | **PASS** | escenario 5 |
| 40 | sin aceptación automática de riesgo | **PASS** | prueba K1, K2 |
| 41 | sin cierre automático de eficacia | **PASS** | prueba K1, K2 |
| 42 | sin cierre automático de auditoría | **PASS** | escenario 7 |
| 43 | sin cierre automático de la revisión | **PASS** | escenario 8 |
| 44 | señal explicable | **PASS** | prueba B4, F2 |
| 45 | retrato mínimo | **PASS** | prueba F3 · escenario 1 (una clave) |
| 46 | referencia a la fuente | **PASS** | `source_code`, `subject_type`, `subject_id`, `deep_link` |
| 47 | linaje regla/versión | **PASS** | prueba B6, F3 |
| 48 | linaje de ejecución | **PASS** | `run_id` en la señal |
| 49 | linaje de salida | **PASS** | claves `auto_alert:` / `auto_task:` |
| 50 | simulación | **PASS** | escenario 9 |
| 51 | simulación sin efectos | **PASS** | pruebas E2, E3 + restricción de tabla |
| 52 | mismo evaluador | **PASS** | prueba H1 |
| 53 | ensayo en seco | **PASS** | `quality_automation_run(…, 'simulation')` · prueba E3 |
| 54 | señal idempotente | **PASS** | escenario 1 · prueba G1, G2 |
| 55 | alerta idempotente | **PASS** | prueba G5, L2 |
| 56 | tarea idempotente | **PASS** | prueba G5, L2 |
| 57 | dedupe concurrente | **PASS** | escenario 11 |
| 58 | reintento idempotente | **PASS** | escenario 12 |
| 59 | rearme de la condición | **PASS** | escenario 3 |
| 60 | recurrencia | **PASS** | escenario 3 |
| 61 | resolución determinística | **PASS** | prueba G7 · escenario 2 |
| 62 | reconocer ≠ resolver | **PASS** | prueba T1 |
| 63 | supresión con historia | **PASS** | prueba T3 |
| 64 | prevención de bucles | **PASS** | §U · pruebas J1–J4, N1, N2 |
| 65 | cadena de causalidad | **PASS** | §V |
| 66 | recursión acotada | **PASS** | profundidad uno por construcción · N2 |
| 67 | reloj del servidor | **PASS** | prueba I1 |
| 68 | día de negocio local | **PASS** | prueba I2 · `business_timezone` |
| 69 | planificador = un motor | **PASS** | prueba T1 |
| 70 | ejecución manual = mismo motor | **PASS** | prueba T1, escenario 1 |
| 71 | ejecución de sistema = mismo motor | **PASS** | prueba V1 |
| 72 | ejecuciones acotadas | **PASS** | `p_limit` · prueba T6 · V3 |
| 73 | paginación | **PASS** | `p_limit` en las 18 ramas · listados acotados |
| 74 | aislamiento del fallo | **PASS** | pruebas L3, W1 |
| 75 | salud de las reglas | **PASS** | `quality_automation_health` · prueba W2 |
| 76 | fallo operativo visible | **PASS** | contadores separados · `automation_engine_failure` |
| 77 | cobertura de documentos | **PASS** | `document_revision` + plantilla |
| 78 | cobertura de indicadores | **PASS** | escenarios 1–3 |
| 79 | cobertura de objetivos | **PASS** | `objective` + plantilla |
| 80 | cobertura de casos y acciones | **PASS** | `case` · `action` + 2 plantillas |
| 81 | cobertura de riesgos | **PASS** | `risk` · `control` · `opportunity` + plantilla |
| 82 | cobertura de personas | **PASS** | escenario 5 |
| 83 | cobertura de proveedores | **PASS** | escenario 4 |
| 84 | cobertura de voz del cliente | **PASS** | escenarios 6 y 15 |
| 85 | cobertura de auditorías | **PASS** | escenario 7 |
| 86 | cobertura de la revisión | **PASS** | escenario 8 |
| 87 | regla que cruza dominios | **PASS** | §X |
| 88 | explicabilidad del cruce | **PASS** | la explicación nombra las dos condiciones |
| 89 | biblioteca de reglas seguras | **PASS** | 14 plantillas · prueba L4 |
| 90 | configuración por empresa | **PASS** | `quality_automation_settings` · prueba A3 |
| 91 | sin activación masiva | **PASS** | prueba A4, L5 |
| 92 | barridos anteriores auditados | **PASS** | `QUALITY_11_OLD_SWEEP_INVENTORY.md` |
| 93 | duplicados eliminados o adaptados | **PASS** | ocho integrados · prueba B6 (0 avisos en el segundo) |
| 94 | compatibilidad hacia atrás | **PASS** | prueba L1 · 15 suites RLS verdes |
| 95 | anonimato de Q08 preservado | **PASS** | escenario 15 · Q08-rls contra Staging |
| 96 | salvaguarda de personas | **PASS** | prueba N3 · escenario 5 |
| 97 | retrato mínimo por privacidad | **PASS** | prueba F3, N4 |
| 98 | RLS de reglas | **PASS** | prueba M2, Q1 |
| 99 | RLS de versiones | **PASS** | prueba M2, Q1 |
| 100 | RLS de ejecuciones | **PASS** | prueba M3, Q1 |
| 101 | RLS de señales | **PASS** | prueba M4, Q1, Q2 |
| 102 | fuente de la misma empresa | **PASS** | prueba Q3 |
| 103 | destinatario de la misma empresa | **PASS** | prueba R2 |
| 104 | PostgREST directo denegado | **PASS** | prueba R7 |
| 105 | `security definer` con guarda | **PASS** | prueba M1, M6 |
| 106 | ejecución cruzada denegada | **PASS** | prueba Q4, Q5 |
| 107 | simulación cruzada denegada | **PASS** | prueba Q4 |
| 108 | inyección de fuente denegada | **PASS** | prueba R3 |
| 109 | inyección de operador denegada | **PASS** | prueba R4 |
| 110 | inyección de salida denegada | **PASS** | prueba R5 |
| 111 | configuración inválida denegada | **PASS** | prueba R6 |
| 112 | ciclo de vida de la regla | **PASS** | pruebas O1–O3, U1–U3 |
| 113 | ciclo de vida de la señal | **PASS** | pruebas T1–T3 |
| 114 | inmutabilidad de la ejecución | **PASS** | prueba M3, R7 |
| 115 | exportación de la regla | **PASS** | dos claves · prueba R1, R3 |
| 116 | exportación de la señal | **PASS** | dos claves · prueba R4 |
| 117 | exportación de la ejecución | **PASS** | dos claves · prueba R5 |
| 118 | cabecera corporativa | **PASS** | `test:export012` verde |
| 119 | logotipo canónico | **PASS** | `test:export013` verde |
| 120 | `Q11_EXPORT_PENDING = 0` | **PASS** | `test:export011` · inventario sin pendientes |
| 121 | escenario del indicador | **PASS** | bloque B |
| 122 | escenario de recuperación | **PASS** | bloque C |
| 123 | escenario de reaparición | **PASS** | bloque D |
| 124 | escenario del proveedor | **PASS** | bloque P |
| 125 | escenario de personas | **PASS** | bloque G |
| 126 | escenario de la queja | **PASS** | bloque H |
| 127 | escenario de la auditoría | **PASS** | bloque I |
| 128 | escenario de la revisión | **PASS** | bloque J |
| 129 | escenario de simulación | **PASS** | bloque E |
| 130 | escenario de versión | **PASS** | bloque F |
| 131 | escenario de concurrencia | **PASS** | bloque L |
| 132 | escenario de reintento | **PASS** | bloque M |
| 133 | escenario de bucle | **PASS** | bloque N |
| 134 | escenario multiempresa | **PASS** | bloque Q |
| 135 | escenario de anonimato | **PASS** | bloque K |
| 136 | pruebas puras verdes | **PASS** | 129 conformes |
| 137 | pruebas RLS locales verdes | **PASS** | 68 conformes |
| 138 | pruebas del planificador verdes | **PASS** | bloque V + endpoint contra Staging |
| 139 | rendimiento probado | **PASS** | `QUALITY_11_PERFORMANCE.md` |
| 140 | replay local verde | **PASS** | 0001…0130, EXIT 0 |
| 141 | regresiones de Quality | **PASS** | 15 suites RLS + `test:all` |
| 142 | regresión Q10 | **PASS** | 61 conformes (local y Staging) |
| 143 | regresión Q09 | **PASS** | 60 conformes (local y Staging) |
| 144 | regresión de anonimato Q08 | **PASS** | 60 conformes (local y Staging) |
| 145 | regresión Q07 | **PASS** | 48 conformes |
| 146 | regresión Q06/Q06.1 | **PASS** | 58 y 28 conformes |
| 147 | regresiones de exportación | **PASS** | las cuatro suites verdes |
| 148 | regresión PCR | **PASS** | dentro de `test:all` |
| 149 | regresión Textiles | **PASS** | dentro de `test:all` |
| 150 | regresión TrazaDocs | **PASS** | dentro de `test:all` |
| 151 | regresión de acceso y equipo | **PASS** | dentro de `test:all` |
| 152 | invariante de QA | **PASS** | `test:release` verde |
| 153 | `test:all` EXIT 0 | **PASS** | verificado |
| 154 | migración append-only | **PASS** | 0129 intacta · corrección en 0130 |
| 155 | paridad local | **PASS** | 0130 |
| 156 | paridad Staging | **PASS** | 0130, sin desalineadas |
| 157 | escenarios reales en Staging | **PASS** | seis dominios · 19 señales |
| 158 | segundo barrido sin duplicados | **PASS** | 0/0/0 |
| 159 | Preview contra Staging | **PASS** | cuatro variables, solo esta rama |
| 160 | Preview READY | **PASS** | ● Ready · SSO 302 |
| 161 | Production en 0111 | **PASS** | verificado |
| 162 | Production intacta | **PASS** | §AN |
| 163 | sin planificador en Production | **PASS** | ningún cron configurado |
| 164 | repo desvinculado | **PASS** | ningún proyecto Supabase enlazado |
| 165 | árbol limpio | **PASS** | tras este commit |
| 166 | push normal | **PASS** | sin forzar |
| 167 | matriz AT completa | **PASS** | 45/45 |

**166 PASS · 1 PARCIAL (#11, GAP-02) · 0 FAIL.**

---

# Adenda · QUALITY-11.1 (cierre de los dos huecos)

Este informe se mantiene tal como se emitió: es lo que era cierto al cerrar
QUALITY-11. Lo que sigue dice qué cambió después, sin reescribir nada de arriba.

## Los dos huecos, cerrados

**GAP-01 · CERRADO.** `quality_scan_pending_measurements` y
`work_scan_pending_actions` ya no dependen de una sesión humana: con sesión
mantienen exactamente los mismos permisos, y sin ella se ejecutan como proceso
del sistema, igual que los otros seis barridos desde 0117. Además **ceden** ante
la regla equivalente de QUALITY-11 si la empresa la adopta, de modo que la misma
condición nunca produce dos avisos.

**GAP-02 · CERRADO.** Existe el puente real: hecho de negocio → enrutador →
regla por evento activa → **el mismo** evaluador → **el mismo** ejecutor de
salidas → señal, con linaje hasta el hecho e idempotencia por acuse de entrega.
Probado de punta a punta en cuatro dominios con las RPC de dominio reales, en
local y contra Staging.

## El criterio que cambia de veredicto

| # | Criterio | En QUALITY-11 | Ahora |
|---|---|---|---|
| 11 | camino por evento | **PARCIAL** | **PASS** |

**El recuento consolidado pasa a 167 PASS · 0 PARCIAL · 0 GAP · 0 FAIL.**

## Lo que cambió del código de QUALITY-11

Una sola cosa estructural: el bloque que emitía las salidas dentro del barrido
salió a su propia función, `quality_automation_emit`, para que el puente use
literalmente la misma y no una parecida. Las 68 comprobaciones de QUALITY-11
contra base real siguen verdes después de la extracción.

Y tres afirmaciones de sus suites se actualizaron porque dejaron de ser ciertas
al cerrarse el hueco: los ocho observadores ya no se omiten, las plantillas son
21 en vez de 14, y hay un cuarto tipo de ejecución —«por un hecho ocurrido»—.

Todo lo demás sigue igual. Detalle en `docs/quality/quality-11-1/`.
