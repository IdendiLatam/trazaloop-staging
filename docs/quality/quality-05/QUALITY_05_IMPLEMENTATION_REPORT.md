# QUALITY-05 · Informe de implementación

**Rama:** `feature/quality-05-risks-opportunities`
**Baseline de partida:** `88868fe` (`baseline/quality-04-post-qa`)
**Migración:** `0122_quality_risks_and_opportunities.sql`

## Qué se construyó

El dominio operativo de Riesgos y Oportunidades conforme RO-01…RO-35, con el
recorrido completo:

```
IDENTIFICAR → ANALIZAR → EVALUAR → DECIDIR → TRATAR → SEGUIR → REVISAR → CONSERVAR
```

Veintiséis tablas, doce RPC de decisión formal, dos proyecciones, cuatro dictámenes
de ciclo de vida, y el ensanche de los cinco catálogos transversales de QUALITY-04.

## La decisión que ordena todo lo demás

**La metodología es un dato, no código.**

Habría sido más corto cablear probabilidad × impacto con una matriz 5×5. También
habría hecho imposibles dos cosas que RO exige a la vez: que la empresa configure
sus escalas (RO-03) y que una evaluación de 2026 se siga explicando con lo que
regía en 2026 (RO-04). Con la fórmula en el programa, publicar criterios nuevos
reescribiría el pasado sin tocar una sola fila.

De esa decisión salen, sin añadir nada:

- la **matriz visual**, que se dibuja recorriendo las escalas de la versión;
- el **apetito** (RO-08), que es una propiedad del nivel de resultado;
- la **periodicidad de revisión** (RO-35), que también;
- la **explicación** que lee el usuario, que es el rastro del mismo cálculo.

## Los ocho límites que el modelo hace imposibles de cruzar

| Distinción | Dónde vive |
|---|---|
| Riesgo ≠ no conformidad | `quality_risks` vs `work_cases`, sin ninguna ruta automática entre ellos |
| Materializado ≠ NC | `quality_materialize_risk` no inserta en `work_cases`; una prueba lo comprueba sobre el cuerpo de la función |
| Control ≠ acción | tablas distintas; el control no tiene `due_on` |
| Causa ≠ evento ≠ consecuencia | tres tablas; el evento es obligatorio |
| Inherente ≠ residual | `assessment_kind`, dos filas |
| Nivel ≠ estado | `current_level` (vista) vs `status` (columna) |
| Metodología ≠ evaluación | FK a la versión inmutable |
| Oportunidad ≠ acción de mejora | catálogos de decisión disjuntos, comprobado por prueba |

## Lo que se reutilizó en vez de duplicar

No existen `risk_actions`, `risk_tasks`, `risk_alerts`, `risk_files` ni
`risk_indicators`. Se **ensancharon** de forma aditiva los catálogos cerrados de
`work_tasks`, `work_alerts`, `work_events`, `work_decisions` y `work_references`,
sin perder ningún valor anterior.

La evolución más delicada fue `work_reference_must_be_valid()`. El original
resolvía el propietario con `if owner_kind = 'case' … else (acción)`. Al admitir
cinco propietarios, ese `else` habría validado un riesgo contra la tabla de
acciones y lo habría rechazado siempre. Se reescribió para resolver cada tipo por
su nombre.

Una acción de tratamiento usa la **misma** `createActionAction` que una acción
correctiva: solo cambia de qué objeto nace. La rama del caso quedó intacta, y una
prueba lo verifica.

## Defectos encontrados durante el sprint

**Cinco los encontraron las pruebas contra base real:**

| Defecto | Gravedad |
|---|---|
| Las vistas nuevas se saltaban la RLS por falta de `security_invoker` — una empresa podía leer la proyección de otra | **grave** |
| Tareas y alertas se insertaban sin destinatario contra una columna `NOT NULL` | funcional |
| Un disparador compartido resolvía `new.scale_id` sobre una tabla que no lo tiene | funcional |
| La materialización, hecha inmutable, no podía enlazar el caso que abría | funcional |
| Reutilización de una variable en `quality_assess_risk` | leído antes de aplicar |

**Siete los encontró el navegador, y ninguna prueba los habría visto:**

- «Tiene 2 **tiene 2 evaluaciones**» — el dictamen devolvía frases donde la
  interfaz esperaba sintagmas nominales;
- «ya salio del borrador (**active**)» — código interno en inglés en pantalla;
- «**Este** oportunidad» — concordancia de género;
- «Priorizada · **prioritization:Alta**» y «Decisión de tratamiento · **pursue**»
  — códigos internos en el historial;
- la matriz marcaba **dos** celdas: buscaba por puntaje, y 3×4 y 4×3 dan 12;
- el aviso de aprobación seguía en pantalla contradiciendo al desplegable, porque
  el `<select>` no era controlado;
- se ofrecía «Aprobar la aceptación» a quien la había propuesto, y el servidor la
  rechazaba siempre.

**Uno lo encontró la comparación con el resto del repositorio:** los mensajes de
la migración iban sin tildes mientras 0121 las usa en 29 mensajes. Al corregirlos
rompí el plural de «evaluación»; se detectó y reparó en la misma pasada.

## Estado

| | |
|---|---|
| `npm run test:all` | **salida real 0** |
| Suite pura QUALITY-05 | 56 ✔ · 0 ✘ |
| Suite base real QUALITY-05 | 74 ✔ · 0 ✘ **en local y en Staging** |
| Suites RLS de QUALITY-01…04 tras 0122 | todas verdes |
| Staging | migrado a 0122, cuentas QA intactas |
| Production | sin tocar |
| Repo | REMOTE UNLINKED, árbol limpio |

## Lo que este sprint NO abrió

Auditorías, proveedores, voz del cliente, revisión por la dirección, IA, análisis
predictivo, Monte Carlo, bow-tie, FMEA, riesgos sectoriales de PCR o Textiles. Una
prueba pura lo comprueba tabla por tabla.

QUALITY-06 no se ha iniciado.
