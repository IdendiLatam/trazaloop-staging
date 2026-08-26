# QUALITY-09 · El informe y la verdad histórica

## 1 · El informe es una FOTO

`quality_issue_audit_report(audit_id, summary)` arma un `snapshot jsonb` con el
retrato de **entonces**:

| En la foto | Por qué |
|---|---|
| Datos de la auditoría, con las tres fechas | Para no tener que reconstruirlas |
| El equipo auditor de entonces | Alguien cambia de puesto; el informe no |
| El alcance, con la revisión de proceso | El proceso se reescribe; lo auditado no |
| Los criterios, con la **revisión de documento auditada** | Es la que hace que el hallazgo siga significando algo |
| Los hallazgos, con su clasificación propuesta y su caso | Congelados como estaban al emitir |
| Las muestras | «10 de 400» no se recalcula |
| Lo que quedaba abierto | Casos, acciones y hallazgos sin evaluar |

El PDF `quality.audit-report.detail` se imprime **desde `snapshot`**, nunca
desde el estado de hoy. Leer el estado actual bajo el encabezado de un informe
emitido en 2024 sería fabricar un pasado con formato de prueba.

**Verificado contra base real** (`test:quality09-rls` I3): tras emitir el
informe se añade un auditor al equipo. El equipo de hoy pasa a dos personas; la
foto del informe sigue diciendo una.

## 2 · Un informe emitido no se edita

Sin política de `update` ni de `delete` sobre `quality_audit_reports`. La
corrección es un **informe nuevo** con `supersedes_id` apuntando al anterior, y
los dos se conservan: quien recibió el primero puede comprobar qué cambió.

**Verificado** (I4–I5): el intento de reescribir el resumen no prospera, el
intento de borrarlo deja la fila en su sitio, y el segundo informe nace como
versión 2 apuntando al primero.

## 3 · Sin conclusiones no hay informe

La RPC lo rechaza con un mensaje escrito para una persona: «Un informe sin
conclusiones no es un informe. Escríbelas antes de emitirlo.»

Las conclusiones no se deducen. Ninguna rama de la base las escribe.

## 4 · Trazaloop NO certifica

Prohibido en todo el dominio —dominio, base, pantallas, rutas y los doce
papeles—: «Certificado», «Certificamos», «ISO compliant», «conforme a la norma»,
«acreditado» como afirmación.

```
Trazaloop administra auditorías. La certificación la concede un organismo
acreditado, que no es esto. Un informe de auditoría interna no es un
certificado, y presentarlo como tal es lo que hace que una auditoría externa
empiece mal.
```

Esa frase (`TRAZALOOP_DOES_NOT_CERTIFY`) va en la ficha de la auditoría, en la
portada del dominio, en el listado, en el informe, en el plan, en el registro de
ejecución y en el reporte de seguimiento.

`test:quality09` I1–I4 barre el dominio, los adaptadores, los componentes y las
rutas buscando esas cinco expresiones, y solo las tolera dentro de un contexto
que las **niega**.

## 5 · Qué es histórico y qué no

| Documento | Temporalidad | Por qué |
|---|---|---|
| Informe de auditoría | `historical` | Tiene su instantánea |
| Checklist de auditoría | `historical` | Imprime todas sus versiones publicadas |
| Ficha de auditoría | `current` | El documento del pasado es su informe |
| Plan de auditoría | `current` | Lo planificado se lee en la fecha original y las reprogramaciones |
| Agenda | `current` | Lo que pasó está en la ejecución |
| Registro de ejecución | `current` | El congelado es el informe |
| Hallazgo | `current` | Su foto vive en el informe |
| Programa | `current` | Sus revisiones guardan las fotos |
| Seguimiento | `current` | Es, por definición, la situación de hoy |

Cada `current` lleva su `historicalLimitReason` escrita, y el papel imprime el
aviso de estado actual. Antes de fabricar un pasado que la base no guarda, se
declara que no se guarda.
