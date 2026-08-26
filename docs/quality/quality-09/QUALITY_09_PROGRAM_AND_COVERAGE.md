# QUALITY-09 · Programa y cobertura

## 1 · Un programa NO es una auditoría

Es la confusión más cara del dominio, porque se nota tarde: una organización
que trata «el programa» como «la auditoría» descubre en la auditoría externa
que tiene un plan aprobado y ninguna evidencia de haberlo ejecutado.

En el modelo son dos tablas con dos ciclos que no se parecen:

| | Programa | Auditoría |
|---|---|---|
| Estados | `draft` · `active` · `closed` · `cancelled` | `draft` · `planned` · `in_progress` · `executed` · `reported` · `closed` · `cancelled` |
| Fechas | periodo (`period_start/end`) | original, vigente y ejecutada |
| Hallazgos | ninguno | los suyos |
| Se «ejecuta» | no | sí |

El programa tampoco es un documento congelado: cambia durante el año, y eso es
normal. Lo que no puede cambiar es la versión anterior.

## 2 · Cada cambio deja una revisión

`quality_record_program_revision(program_id, change_kind, change_note)` numera
la siguiente revisión y guarda su `snapshot`. La tabla no tiene política de
`update` ni de `delete`: lo que se escribió se queda.

Las clases de cambio: `created`, `approved`, `audit_added`, `audit_removed`,
`rescheduled`, `scope_changed`, `closed`, `other`.

## 3 · La cobertura es un dato, no una felicitación

`v_quality_audit_program_coverage` deriva todo de las auditorías reales. No hay
ninguna columna `coverage_pct` guardada: una cobertura almacenada se
desincroniza el primer día que alguien cancela algo.

**La regla que sostiene el número:** una auditoría cancelada sigue contando como
planificada no ejecutada.

```
4 planificadas · 2 ejecutadas · 1 cancelada · 1 pendiente
  → "2 de 4 ejecutadas · 1 pendiente · 1 cancelada."  → 50 %
```

Si la cancelada saliera del denominador, la cobertura pasaría a 66 % sin que
nadie hubiera auditado nada más. Esa cifra es exactamente la que se enseña en
una auditoría externa creyendo que dice lo que no dice.

**Verificado contra base real** (`test:quality09-rls` C1–C3): dos auditorías
planificadas dan 0 %; cancelar una las deja en 0 %, con `cancelled_audits = 1`
y la auditoría cancelada intacta con su razón.

## 4 · Un programa vacío no tiene cobertura

`coverage_pct` es `null`, y la interfaz dice «El programa todavía no tiene
auditorías». Escribir 0 % ahí es afirmar un incumplimiento que no existe.

## 5 · Priorizar sugiere; no programa

`quality_audit_priority_context(organization_id, process_id)` reúne lo que el
sistema ya sabe de un proceso:

- riesgos por encima del criterio aceptable y materializaciones
  (`v_quality_risk_overview` + `work_references`);
- indicadores fuera de meta (`quality_indicators.scope_process_id` y
  `v_quality_indicator_status`);
- casos abiertos y no conformidades del proceso;
- cuándo se auditó por última vez y cuántos hallazgos dejó.

Y devuelve dos banderas explícitas:

```json
{ "suggests_only": true, "schedules_automatically": false }
```

`explainPriority()` convierte eso en un peso **con sus motivos**: cada punto se
puede señalar en la pantalla y decir de dónde salió. Un riesgo alto no programa
una auditoría; se lo cuenta a quien decide.

## 6 · Cerrar el programa

Exige una nota de cierre de al menos diez caracteres. Lo que se cierra es el
periodo, no las auditorías que contuvo: cada una conserva su propio estado y su
propia historia.
