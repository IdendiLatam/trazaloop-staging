# QUALITY-09 · Cobertura documental

**Doce claves nuevas por el registro cerrado.** Ninguna tiene endpoint propio:
el navegador solo puede nombrar una clave de la lista, y todo lo demás lo decide
el servidor.

## 1 · Las doce

| Clave | Documento | Eje | Temporalidad |
|---|---|---|---|
| `quality.audit-program.detail` | Programa de auditorías | detail | current |
| `quality.audit-program.list` | Listado de programas de auditoría | list | current |
| `quality.audit.detail` | Ficha de auditoría | detail | current |
| `quality.audit.list` | Listado de auditorías | list | current |
| `quality.audit-plan.detail` | Plan de auditoría | detail | current |
| `quality.audit-agenda.detail` | Agenda de auditoría | detail | current |
| `quality.audit-checklist.detail` | Checklist de auditoría | detail | **historical** |
| `quality.audit-execution.detail` | Registro de ejecución de auditoría | detail | current |
| `quality.audit-finding.detail` | Hallazgo de auditoría | detail | current |
| `quality.audit-finding.list` | Listado de hallazgos de auditoría | list | current |
| `quality.audit-report.detail` | Informe de auditoría | **historical** | **historical** |
| `quality.audit-followup.list` | Reporte de seguimiento de auditorías | list | current |

Gramática respetada: `modulo.entidad.{detail|list|historical}`. Los cuatro
listados empiezan por «Listado» o «Reporte».

## 2 · Las tres reglas que atraviesan los doce

1. **§39 · Ninguno certifica nada.** No aparece «Certificado», «ISO compliant»
   ni «conforme a la norma» como afirmación. Cada papel lleva
   `TRAZALOOP_DOES_NOT_CERTIFY`.
2. **§30 · Ninguno llama «no conformidad» a un hallazgo.** Ni al propuesto como
   posible. La ficha del hallazgo separa en dos secciones rotuladas «Lo que
   PROPUSO el auditor» y «Lo que se DECIDIÓ».
3. **§41 · El informe se imprime desde su instantánea.** No desde el estado de
   hoy.

## 3 · El inventario

Diecinueve entidades nuevas clasificadas. Los nombres llevan apellido porque
QUALITY-04 ya tiene «Hallazgo» —el de un caso, que es otra cosa— y el inventario
no admite dos filas con el mismo nombre.

| Entidad | detail | list | historical |
|---|---|---|---|
| Programa de auditorías | AVAILABLE | AVAILABLE | sin histórico, con motivo |
| Revisión del programa | EMBEDDED | EMBEDDED | EMBEDDED |
| Auditoría | AVAILABLE | AVAILABLE | AVAILABLE (su informe) |
| Reprogramación | EMBEDDED | EMBEDDED | EMBEDDED |
| Plan de auditoría | AVAILABLE | EMBEDDED | sin histórico, con motivo |
| Elemento del alcance | EMBEDDED | EMBEDDED | EMBEDDED (informe) |
| Criterio de auditoría | EMBEDDED | EMBEDDED | EMBEDDED (informe) |
| Agenda de auditoría | AVAILABLE | EMBEDDED | sin histórico, con motivo |
| Equipo auditor | EMBEDDED | EMBEDDED | EMBEDDED (informe) |
| Comprobación de independencia | EMBEDDED | EMBEDDED | EMBEDDED |
| Checklist de auditoría | AVAILABLE | EMBEDDED | AVAILABLE |
| Pregunta de checklist | EMBEDDED | EMBEDDED | EMBEDDED |
| Registro de ejecución | AVAILABLE | EMBEDDED | sin histórico, con motivo |
| Nota de auditoría | EMBEDDED | EMBEDDED | EMBEDDED |
| Muestra de auditoría | EMBEDDED | EMBEDDED | EMBEDDED (informe) |
| Evidencia de auditoría | EMBEDDED | EMBEDDED | EMBEDDED |
| Hallazgo de auditoría | AVAILABLE | AVAILABLE | EMBEDDED (informe) |
| Informe de auditoría | AVAILABLE | EMBEDDED | AVAILABLE |
| Seguimiento de auditorías | EMBEDDED | AVAILABLE | sin histórico, con motivo |

Inventario total tras QUALITY-09: **178 entidades · 150 claves prometidas**.

**Q09_EXPORT_PENDING = 0.**

## 4 · Alcanzables desde la pantalla

`test:export01` H1 comprueba que **toda** clave del registro se ofrece en alguna
pantalla. Las doce tienen su botón:

| Dónde | Qué se descarga |
|---|---|
| Programa · listado | listado de programas · ficha por fila |
| Auditorías · listado | listado de auditorías · ficha por fila |
| Ficha de la auditoría | ficha, plan, agenda, registro de ejecución |
| Ficha · hallazgos | listado y ficha por hallazgo |
| Ficha · informes | el informe, por versión |
| Checklists | el checklist con todas sus versiones |
| Resumen | reporte de seguimiento |

## 5 · Suites en verde

```
test:export01   → 54 conformes, 0 fallos
test:export011  → 31 conformes, 0 fallos
test:export012  → 28 conformes, 0 fallos
test:export013  → 34 conformes, 0 fallos
```
