# QUALITY-09 · Informe de implementación
### Programa de auditorías · auditoría individual · plan · ejecución · evidencia · hallazgos · informe

**Rama:** `feature/quality-09-audits`
**Baseline:** `baseline/quality-08-post-acceptance` = `012b67fc4b5511958ff550e74431fe06f0506028`
**Migración:** `0127_quality_audits.sql` — 3 801 líneas, append-only
**Cabeceras:** Local **0127** · Staging **0127** · Production **0111**

---

## A · Qué se construyó

El dominio transversal de Auditorías, completo, sobre el ciclo real del trabajo:

```
PROGRAMA → AUDITORÍA → PLAN → EJECUCIÓN → EVIDENCIA → HALLAZGOS
        → CONCLUSIONES → INFORME → SEGUIMIENTO
```

Veintidós tablas, tres vistas, veintisiete funciones, cuarenta y tres políticas,
cuarenta y un disparadores. Siete rutas, ocho componentes, cuarenta y dos
acciones de servidor y doce papeles.

## B · Lo que NO se construyó, a propósito

No hay un segundo motor de casos, ni de acciones, ni de tareas, ni de avisos, ni
de documentos, ni un bucket de archivos. Todo lo que ya existía se reusa.

QUALITY-04 había anticipado este dominio en 0116: `work_cases.case_type` ya
incluía `'audit_finding'` y `origin_kind` ya incluía `'audit'`, con
`work_case_findings`, `work_case_requirements` y `work_case_processes`. Este
sprint los usa tal cual.

Un segundo motor de casos no es un atajo técnico: es el punto exacto en el que
la organización deja de poder responder «¿cuántas no conformidades tenemos?» con
un solo número.

## C · PROGRAMA ≠ AUDITORÍA INDIVIDUAL

Dos tablas, dos ciclos de estados que no se parecen, dos naturalezas. El
programa no tiene fechas de ejecución ni hallazgos; la auditoría no tiene
periodo ni cobertura. Ver `QUALITY_09_PROGRAM_AND_COVERAGE.md`.

## D · El programa es dinámico, y su historia se conserva

`quality_audit_program_revisions` guarda un `snapshot jsonb` por cambio. La
tabla no tiene política de `update` ni de `delete`.

## E · La cobertura es un dato

Derivada de las auditorías reales, nunca almacenada. **Una auditoría cancelada
sigue contando como planificada no ejecutada.** Un programa sin auditorías
devuelve `null`, no 0 %.

## F · Una auditoría puede vivir fuera del programa

`program_id` es nullable y `nature = 'extraordinary'` lo declara. Una auditoría
extraordinaria es legítima; solo tiene que decir que lo es, y el informe lo dirá.

## G · Reprogramar conserva la fecha original

`planned_from/to` (ORIGINAL) frente a `scheduled_from/to` (VIGENTE), y un rastro
en `quality_audit_reschedules` con motivo obligatorio y autor.

## H · Cancelar no es borrar

Estado `cancelled` con `cancelled_at` y razón obligatoria. La auditoría sigue
existiendo y sigue contando en la cobertura.

## I · El alcance es estructurado

Nueve clases con su `check` de coherencia, y `process_revision_id` cuando el
elemento es un proceso.

## J · CRITERIO DE AUDITORÍA ≠ PREGUNTA DE CHECKLIST

Dos tablas sin puente. El criterio no tiene `prompt` ni `stable_key`; la
pregunta no referencia criterios.

## K · La revisión de ENTONCES

`quality_audit_criteria.document_revision_id`. El expediente resuelve la
revisión vigente **en la fecha de la auditoría** para procesos y documentos, y
el informe la congela.

## L · El checklist es una ayuda con versiones

`draft` → `published` → `superseded`. Publicada no se edita: se crea la
siguiente, que hereda las claves estables. La auditoría corre una **versión**.

## M · Contestar una pregunta NO crea un hallazgo

`checkResultCreatesFinding()` devuelve `false` para las cuatro respuestas.
Ninguna rama de la base inserta en `quality_audit_findings` desde ahí.

## N · AUDITOR ≠ RESPONSABLE DE LA AUDITORÍA

`owner_position_id` es el cargo que responde; el equipo son personas con cinco
papeles y un solo `lead`.

## O · El auditor externo no necesita cuenta

El equipo cuelga de `quality_people`, no de `profiles`.

## P · La competencia informa; no decide

El expediente la muestra y devuelve `decides_nothing: true`. No bloquea a nadie.

## Q · La independencia es HISTÓRICA

`quality_audit_conflicts_on` lee `quality_position_assignments` acotando por
vigencia a la fecha de la auditoría. Una auditoría de 2026 conducida por quien
respondía de Compras sigue teniendo ese conflicto en 2029.

## R · El sistema NUNCA declara a nadie independiente

`declares_independence: false`, siempre. Un conflicto detectado exige decisión
humana, y aceptarlo exige mitigación escrita.

## S · La agenda es una intención

Planificó; la ejecución registró. Dos capas, las dos conservadas.

## T · NOTA ≠ EVIDENCIA ≠ HALLAZGO

Tres tablas. La nota no se ata a evidencia ni a hallazgo. La evidencia no tiene
`finding_id` obligatorio.

## U · La evidencia REFERENCIA

Sin `file_path`, sin bucket. Apunta a documentos, revisiones, indicadores,
mediciones, evaluaciones de proveedor, riesgos, casos y evidencias de PCR.

## V · La muestra no es cobertura

`population_size` y `sample_size`, con `check`. «10 de 400 (2,5 %)», nunca
«revisado».

## W · Las notas restringidas se filtran en la base

`quality_can_read_audit_note()` en la política de `select`, y la escritura
partida en `insert`/`update`/`delete` porque `for all` habría reabierto la
lectura.

## X · HALLAZGO ≠ NO CONFORMIDAD

El catálogo de `proposed_classification` **no admite `'nonconformity'`**.
Registrar, atar evidencia, evaluar y escalar dejan el conteo de NC intacto,
medido antes y después de cada acto contra base real.

## Y · OBSERVACIÓN ≠ NO CONFORMIDAD

`observation` es una clasificación propia, y `OBSERVATION_IS_NOT_NC` aparece en
la pantalla de hallazgos y en los papeles.

## Z · La conformidad es local

«Este proceso, contra estos criterios, en esta muestra.» No dice que el sistema
esté conforme.

## AA · Evaluar y escalar son actos de autoridad

Con razón escrita. `escalated` no se puede fijar directamente: la acción lo
rechaza y redirige a «Abrir caso desde el hallazgo».

## AB · El caso que nace tampoco es una NC

`quality_open_case_from_audit_finding()` no contiene `'nonconformity'` en
ninguna rama.

## AC · La clasificación formal se LEE del caso

`caseClassification` viene de `work_cases`. La ficha y el PDF separan «Lo que
PROPUSO el auditor» de «Lo que se DECIDIÓ».

## AD · Las conclusiones las escribe una persona

Nadie las deduce. Sin conclusiones, no hay informe.

## AE · El informe es una FOTO

`snapshot jsonb` con el equipo, el alcance, los criterios con su revisión, los
hallazgos y lo que quedaba abierto. El PDF se imprime desde ahí.

## AF · Un informe emitido no se edita

Sin `update` ni `delete`. La corrección es un informe nuevo con `supersedes_id`,
y los dos se conservan.

## AG · CERRAR LA AUDITORÍA ≠ CERRAR LAS ACCIONES

Cerrar exige ejecución terminada, informe, cero hallazgos sin evaluar y una nota
de cierre. **No** exige que las acciones estén cerradas; exige decir qué queda.

## AH · El seguimiento se deriva

`v_quality_audit_overview` lee `work_cases` y `work_actions`. No copia contadores.

## AI · La recurrencia es una señal

`v_quality_audit_recurring_findings` informa; no abre nada.

## AJ · Priorizar sugiere; no programa

`suggests_only: true`, `schedules_automatically: false`, y un peso explicable con
sus motivos.

## AK · El barrido avisa y no decide

Seis avisos y seis tareas. No inserta auditorías ni hallazgos ni casos, y no
cambia ningún estado. Idempotente: la segunda pasada devuelve 0.

## AL · TRAZALOOP NO CERTIFICA

Prohibido en dominio, base, pantallas, rutas y los doce papeles. Una prueba
barre las cinco expresiones y solo las tolera dentro de la frase que las niega.

## AM · Multiempresa y seguridad

RLS en las 22 tablas, nada a `anon`, `revoke` antes de `grant`, `search_path`
fijo en todas las definer, revalidación de pertenencia contra la sesión, más de
treinta FK compuestas y nunca `service_role`. Ver `QUALITY_09_PRIVACY_RLS.md`.

## AN · Los doce papeles

Por el registro cerrado, con su nombre documental fijado ahí y el encabezado
corporativo de EXPORT-01.2. Inventario a 178 entidades y 150 claves.
**Q09_EXPORT_PENDING = 0.**

## AO · Estado de entrega

```
supabase db reset --local     → EXIT 0 · cabecera 0127
npm run test:quality09        → 103 conformes, 0 fallos
npm run test:quality09-rls    →  60 conformes, 0 fallos   (local y Staging)
npm run build                 → EXIT 0 · 7 rutas nuevas
npm run test:all              → TEST_ALL_EXIT = 0
supabase db push              → Staging 0127 · paridad sin desalineadas
Preview                       → ● READY · SSO 302 en seis rutas
Production                    → 0111, intacta
```

---

# Criterios de cierre · 125

Leyenda: **PASS** cumple · **GAP** cumple parcialmente · **FAIL** no cumple.

## 1 · Baseline y rama (1–5)

| # | Criterio | Estado |
|---|---|---|
| 1 | Baseline `baseline/quality-08-post-acceptance` verificado y empujado | **PASS** |
| 2 | Rama `feature/quality-09-audits` creada desde ese baseline | **PASS** |
| 3 | Ninguna migración anterior editada | **PASS** |
| 4 | Sin `migration repair`, sin `force push`, sin rebase destructivo | **PASS** |
| 5 | Árbol limpio al terminar | **PASS** |

## 2 · Programa (6–15)

| # | Criterio | Estado |
|---|---|---|
| 6 | El programa es una entidad propia | **PASS** |
| 7 | Ciclo de estados distinto del de la auditoría | **PASS** |
| 8 | El programa no tiene fechas de ejecución ni hallazgos | **PASS** |
| 9 | Cada cambio deja revisión numerada con su foto | **PASS** |
| 10 | Una revisión no se edita ni se borra | **PASS** |
| 11 | La cobertura se deriva; no hay columna almacenada | **PASS** |
| 12 | Una cancelada sigue contando como planificada no ejecutada | **PASS** |
| 13 | Un programa vacío devuelve `null`, no 0 % | **PASS** |
| 14 | Cerrar el programa exige nota | **PASS** |
| 15 | La priorización la escribe una persona y se conserva | **PASS** |

## 3 · Auditoría individual (16–27)

| # | Criterio | Estado |
|---|---|---|
| 16 | Una auditoría puede existir fuera de programa | **PASS** |
| 17 | La naturaleza extraordinaria se declara y se ve | **PASS** |
| 18 | Cuatro tipos de auditoría | **PASS** |
| 19 | Siete estados, con transiciones guardadas | **PASS** |
| 20 | Fecha original y fecha vigente en columnas propias | **PASS** |
| 21 | Reprogramar no toca la original | **PASS** |
| 22 | Reprogramar exige motivo | **PASS** |
| 23 | La reprogramación deja rastro con autor | **PASS** |
| 24 | La ficha dice que hubo reprogramación | **PASS** |
| 25 | Cancelar es estado, no borrado | **PASS** |
| 26 | Cancelar exige razón | **PASS** |
| 27 | Cancelar no mejora la cobertura | **PASS** |

## 4 · Alcance y criterios (28–36)

| # | Criterio | Estado |
|---|---|---|
| 28 | Alcance estructurado en nueve clases | **PASS** |
| 29 | Cada clase con su `check` de coherencia | **PASS** |
| 30 | El alcance guarda la revisión del proceso | **PASS** |
| 31 | Criterio y pregunta de checklist son tablas distintas | **PASS** |
| 32 | El criterio no tiene enunciado de pregunta | **PASS** |
| 33 | Seis clases de criterio | **PASS** |
| 34 | El criterio documental fija la revisión auditada | **PASS** |
| 35 | El expediente resuelve la revisión de la fecha | **PASS** |
| 36 | No se creó un segundo motor documental | **PASS** |

## 5 · Checklist (37–44)

| # | Criterio | Estado |
|---|---|---|
| 37 | El checklist es opcional | **PASS** |
| 38 | Tiene versiones con tres estados | **PASS** |
| 39 | Una versión publicada no se edita | **PASS** |
| 40 | La versión nueva hereda las claves estables | **PASS** |
| 41 | La auditoría corre una versión, no «el checklist» | **PASS** |
| 42 | Publicar la v2 no toca una respuesta de la v1 | **PASS** |
| 43 | Cuatro resultados posibles por pregunta | **PASS** |
| 44 | Contestar NO crea hallazgo, en ningún caso | **PASS** |

## 6 · Equipo e independencia (45–56)

| # | Criterio | Estado |
|---|---|---|
| 45 | Auditor y responsable son campos distintos | **PASS** |
| 46 | Cinco papeles en el equipo | **PASS** |
| 47 | Un solo líder por auditoría | **PASS** |
| 48 | El auditor externo no necesita cuenta | **PASS** |
| 49 | La competencia se muestra y no decide | **PASS** |
| 50 | La independencia se resuelve con los cargos de la fecha | **PASS** |
| 51 | Detecta dueño del proceso auditado | **PASS** |
| 52 | Detecta auditor que es a la vez auditado | **PASS** |
| 53 | El sistema no declara a nadie independiente | **PASS** |
| 54 | Un conflicto exige decisión humana | **PASS** |
| 55 | Aceptar un conflicto exige mitigación escrita | **PASS** |
| 56 | Un cargo ya dejado no produce falso conflicto hoy | **PASS** |

## 7 · Ejecución (57–68)

| # | Criterio | Estado |
|---|---|---|
| 57 | La agenda es una intención declarada | **PASS** |
| 58 | Las reuniones de apertura y cierre se registran | **PASS** |
| 59 | La reunión de cierre presenta; no clasifica | **PASS** |
| 60 | Nota de trabajo con seis clases | **PASS** |
| 61 | La nota no es evidencia ni hallazgo | **PASS** |
| 62 | Las notas restringidas se filtran en la base | **PASS** |
| 63 | La política de escritura no reabre la lectura | **PASS** |
| 64 | La muestra guarda población y tamaño | **PASS** |
| 65 | La muestra no se presenta como cobertura | **PASS** |
| 66 | La evidencia referencia; no sube archivos | **PASS** |
| 67 | La evidencia alcanza doce clases de referencia | **PASS** |
| 68 | Registrar evidencia no crea hallazgo | **PASS** |

## 8 · Hallazgos (69–84) — el núcleo

| # | Criterio | Estado |
|---|---|---|
| 69 | El hallazgo tiene tabla propia | **PASS** |
| 70 | La clasificación se llama PROPUESTA | **PASS** |
| 71 | El catálogo no admite `'nonconformity'` | **PASS** |
| 72 | Cinco clasificaciones propuestas | **PASS** |
| 73 | La observación es una de ellas, y no es NC | **PASS** |
| 74 | La conformidad es local, y se dice | **PASS** |
| 75 | **Registrar un hallazgo no mueve el conteo de NC** | **PASS** |
| 76 | Ni siquiera «posible no conformidad» lo mueve | **PASS** |
| 77 | Registrar no abre caso ni crea acción | **PASS** |
| 78 | Atar evidencia no mueve el conteo | **PASS** |
| 79 | Evaluar no mueve el conteo | **PASS** |
| 80 | **Escalar no mueve el conteo** | **PASS** |
| 81 | El caso que nace no está clasificado como NC | **PASS** |
| 82 | Escalar es explícito y separado de evaluar | **PASS** |
| 83 | Desestimar conserva el hallazgo con su razón | **PASS** |
| 84 | La clasificación formal se lee del caso | **PASS** |

## 9 · Conclusiones, informe y cierre (85–97)

| # | Criterio | Estado |
|---|---|---|
| 85 | Las conclusiones las escribe una persona | **PASS** |
| 86 | El sistema no las deduce de los hallazgos | **PASS** |
| 87 | Sin conclusiones no se emite informe | **PASS** |
| 88 | El informe guarda su instantánea | **PASS** |
| 89 | La foto incluye el equipo de entonces | **PASS** |
| 90 | La foto incluye la revisión de documento auditada | **PASS** |
| 91 | Cambiar el equipo después no cambia el informe | **PASS** |
| 92 | Un informe emitido no se edita ni se borra | **PASS** |
| 93 | La corrección es un informe nuevo que apunta al anterior | **PASS** |
| 94 | Cerrar exige cero hallazgos sin evaluar | **PASS** |
| 95 | Cerrar NO exige acciones cerradas | **PASS** |
| 96 | Cerrar exige decir qué queda abierto | **PASS** |
| 97 | Una auditoría cerrada no admite hallazgos nuevos | **PASS** |

## 10 · Seguimiento y señales (98–104)

| # | Criterio | Estado |
|---|---|---|
| 98 | El seguimiento se deriva del motor transversal | **PASS** |
| 99 | El caso abierto sigue abierto tras cerrar la auditoría | **PASS** |
| 100 | La recurrencia informa y no escala nada | **PASS** |
| 101 | Seis avisos nuevos, ninguno decide | **PASS** |
| 102 | Seis tareas nuevas con destino en la bandeja | **PASS** |
| 103 | El barrido es idempotente | **PASS** |
| 104 | El barrido no cambia estados | **PASS** |

## 11 · Seguridad y multiempresa (105–116)

| # | Criterio | Estado |
|---|---|---|
| 105 | RLS activa en las 22 tablas | **PASS** |
| 106 | Ninguna concede nada a `anon` | **PASS** |
| 107 | Cada tabla revoca antes de conceder | **PASS** |
| 108 | Las vistas son `security_invoker` y con `grant` propio | **PASS** |
| 109 | Toda función definer fija `search_path` | **PASS** |
| 110 | Ninguna confía en el `organization_id` recibido | **PASS** |
| 111 | Más de treinta FK compuestas | **PASS** |
| 112 | Auditoría de A no alcanza proceso, persona ni evidencia de B | **PASS** |
| 113 | Las RPC devuelven vacío o fallan entre empresas | **PASS** |
| 114 | El anónimo no lee, no escribe y no ejecuta | **PASS** |
| 115 | Nunca `service_role` en datos ni en acciones | **PASS** |
| 116 | Toda acción de servidor pasa por la puerta de rol | **PASS** |

## 12 · Ciclo de vida y borrado (117–121)

| # | Criterio | Estado |
|---|---|---|
| 117 | `audit` y `audit_program` en el ciclo de vida común | **PASS** |
| 118 | El dictamen lo emite la función única de siempre | **PASS** |
| 119 | La reescritura conserva las guardas heredadas | **PASS** |
| 120 | Una auditoría con historia no se borra, y dice por qué | **PASS** |
| 121 | Un programa con auditorías no se borra | **PASS** |

## 13 · Papeles, pantalla y entrega (122–125)

| # | Criterio | Estado |
|---|---|---|
| 122 | Doce papeles por el registro cerrado, alcanzables desde la pantalla | **PASS** |
| 123 | Ningún papel, pantalla ni constante promete certificación | **PASS** |
| 124 | `Q09_EXPORT_PENDING = 0` e inventario coherente | **PASS** |
| 125 | `test:all` en verde, Staging 0127, Production 0111 intacta | **PASS** |

---

## Recuento

**125 PASS · 0 GAP · 0 FAIL.**

---

# Veredicto

> ## QUALITY-09 AUDITS READY FOR USER TESTING

Las siete separaciones del dominio están sostenidas por la base, no por la
prosa: `PROGRAMA ≠ AUDITORÍA`, `CRITERIO ≠ PREGUNTA`, `EVIDENCIA ≠ HALLAZGO`,
`HALLAZGO ≠ NO CONFORMIDAD`, `OBSERVACIÓN ≠ NO CONFORMIDAD`,
`RESULTADO ≠ ACCIÓN CORRECTIVA` y `AUDITOR ≠ RESPONSABLE`.

La central se midió, no se afirmó: el recuento de no conformidades de la
organización se leyó antes y después de registrar un hallazgo propuesto como
«posible no conformidad», de atarle evidencia, de evaluarlo y de escalarlo a un
caso. No se movió ninguna de las cuatro veces.

**NO se inicia QUALITY-10.**
