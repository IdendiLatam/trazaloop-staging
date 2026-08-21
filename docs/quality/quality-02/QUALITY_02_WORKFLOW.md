# QUALITY-02 · Workflow documental

**Decisiones ancladas:** D-05 · D-18 · D-19 · D-20 · AT-02 · AT-04 · AT-07 ·
AT-09 · AT-10 · AT-12 · AT-14 · MDR-27 · MDR-33 · MDR-43 · MDR-46 · MDR-49

---

## 1. La máquina de estados

```
                       ┌──────────────────────────────┐
                       │                              │
   crear revisión      ▼                              │
        │        ┌──────────┐   enviar    ┌───────────────┐
        └───────▶│ BORRADOR │────────────▶│  EN REVISIÓN  │
                 └──────────┘             └───────────────┘
                       ▲                     │         │
                       │                     │         │ revisor(es)
        corregir       │       devolver      │         │ aceptan
                       │       con motivo    │         ▼
                 ┌─────────────┐◀────────────┘  ┌──────────────────────┐
                 │  DEVUELTO   │◀───────────────│ PENDIENTE APROBACIÓN │
                 └─────────────┘   devolver     └──────────────────────┘
                       │           con motivo             │
                       │  reenviar                        │ aprobador(es)
                       └──────────────────────────────────┤ aprueban
                                                          ▼
                                                    ┌──────────┐
                                                    │ APROBADA │
                                                    └──────────┘
                                                       │     │
                        effective_from > hoy  ◀────────┘     └──────▶ revisión
                        «aprobado, pendiente                          posterior
                         de vigencia»                                     │
                        effective_from ≤ hoy                              ▼
                        «vigente»                                  ┌──────────────┐
                                                                   │ SUSTITUIDA   │
                                                                   └──────────────┘
```

Y, transversalmente: **RETIRADA**, a la que se llega retirando el documento
desde cualquier punto.

**Ninguna de estas transiciones mueve el número de revisión.** Solo lo hace
`crear nueva revisión`, y lo garantiza un trigger, no la aplicación
(ver `QUALITY_02_DOCUMENT_MODEL.md` §5).

### 1.1 Estados y su nombre en pantalla

| Interno | Lo que lee una persona |
|---|---|
| `draft` | Borrador |
| `in_review` | En revisión |
| `changes_requested` | Devuelto con observaciones |
| `pending_approval` | Pendiente de aprobación |
| `approved` + `effective_from > hoy` | Aprobado · pendiente de vigencia |
| `approved` + `effective_from ≤ hoy` | Vigente |
| `superseded` | Sustituido |
| `retired` | Retirado |

Cada estado lleva además una frase que explica qué significa, visible junto al
distintivo. Un responsable de calidad no debería tener que deducirlo.

---

## 2. Revisores y aprobadores (D-18, D-19)

Es una **tabla**, no un par de columnas `reviewer_id` / `approver_id`:

```
trazadoc_document_workflow_participants
  revision_id · round · participant_role · step_order
  position_id  ← responsabilidad PERSISTENTE (el cargo)   MDR-33
  profile_id   ← persona que decide y queda en el histórico
  decision · decided_at · decision_comment
```

Un modelo de dos columnas no podría soportar nunca lo que el baseline ya dio
por aprobado: 1..N revisores, 1..N aprobadores, rutas secuenciales y paralelas.

### 2.1 Cargo o persona

Se designa preferentemente un **cargo** (D-17). La persona concreta se resuelve
en el momento del envío, a partir del titular vigente, y **queda guardada**: si
mañana cambia el titular del cargo, la decisión ya tomada sigue diciendo quién
la tomó (MDR-33, MDR-43).

Un cargo sin titular vigente se ofrece igualmente en el desplegable —con la
advertencia «sin titular»— y la base lo rechaza con un mensaje claro si se
elige: no hay persona a quien asignarle la tarea.

### 2.2 Rutas

| Modo | A quién le toca AHORA |
|---|---|
| `sequential` — «Uno después de otro» | Solo los participantes del menor `step_order` pendiente |
| `parallel` — «Todos a la vez» | Todos los pendientes de la ronda |

En la interfaz MVP se ofrecen **tres cupos** de revisor y **tres** de aprobador,
en orden. El modelo no tiene ese límite: es una decisión de pantalla, no de
datos, y ampliarla no toca la base.

### 2.3 Al menos un aprobador

Obligatorio. Un documento sin aprobador no es un documento controlado. Los
revisores son opcionales: hay sistemas de gestión pequeños donde revisión y
aprobación son el mismo acto, y obligar a inventar un revisor de adorno sería
peor que no tenerlo. Sin revisores, la revisión pasa directamente a
`pending_approval`.

---

## 3. Rondas: por qué un rechazo no se borra

Reenviar tras una devolución abre una **ronda nueva**. Las decisiones de la
ronda anterior no se borran ni se reescriben (D-20, MDR-49):

```
Ronda 1 · Enviado a revisión           Ana Creadora
Ronda 1 · Devuelto con observaciones   Beto Revisor   «Falta el criterio…»
Ronda 2 · Corregido y reenviado        Ana Creadora
Ronda 2 · Revisión aceptada            Beto Revisor
Ronda 2 · Aprobado                     Carla Aprobadora
```

Todo eso es una sola revisión: la **Revisión 1**.

---

## 4. Motivo obligatorio

Devolver un documento **exige** motivo. Lo exige una restricción `CHECK` de la
base, no un `required` de HTML:

```sql
constraint trazadoc_document_decisions_reason_required check (
  decision_type not in ('changes_requested', 'retired')
  or length(trim(coalesce(reason, ''))) > 0
)
```

Sin motivo, el autor no sabe qué corregir y el histórico no dice nada. El motivo
viaja a tres sitios: la alerta del autor, su tarea de corrección, y el PDF del
documento.

---

## 5. Quién puede decidir

Solo **quien tiene la decisión asignada**, en la ronda en curso y —en ruta
secuencial— en el paso que toca. Ni un administrador puede decidir en nombre de
otro: eso destruiría el valor de la firma.

La comprobación vive en `trazadoc_record_document_decision`, no en un botón
oculto. La suite contra base real lo verifica con once ataques directos por
PostgREST (ver `QUALITY_02_RLS_SECURITY.md`).

---

## 6. Tareas y alertas: la primitiva transversal

`work_tasks` y `work_alerts` **no llevan prefijo de dominio a propósito**:

- **AT-02** — Evento, Alerta, Tarea, Acción y Notificación son cosas distintas.
- **AT-10** — Existe UNA bandeja transversal de tareas.
- **MDR-46** — Acciones, evidencias, workflows, eventos y alertas son
  transversales y no se duplican por dominio.
- **AT-04** — El acoplamiento al origen es por contrato
  `(source_domain, subject_type, subject_id)`, **nunca** por FK a una tabla de
  dominio concreta.

QUALITY-02 las estrena con documentos. Acciones correctivas, auditorías,
riesgos y revisión por la dirección las reutilizarán sin crear tablas hermanas
ni una segunda bandeja.

### 6.1 Tarea ≠ Alerta

| | Tarea | Alerta |
|---|---|---|
| Dice | «te toca hacer esto» | «esto merece tu atención» |
| Se cierra | sola, cuando lo haces | la marcas tú |
| Estados | abierta · en curso · hecha · ya no aplica | nueva · vista · en atención · resuelta · descartada |

Un documento devuelto genera **ambas** para el autor: una tarea (corregir y
reenviar) y una alerta (te lo devolvieron, y este es el motivo).

### 6.2 Idempotencia (AT-07)

`dedupe_key` más un índice único parcial sobre las tareas y alertas abiertas:
reenviar un documento no genera una segunda tarea para el mismo revisor.

### 6.3 Qué NO se implementó

Sin motor de reglas (AT-05), sin escalados, sin digests, sin correlación
contextual, sin notificación por correo. Eso es QUALITY Automation. La alerta
in-app es lo que este sprint entrega, y es lo que el encargo declara
obligatorio.

---

## 7. Eventos que disparan tarea y alerta

| Ocurre | Tarea para | Alerta para |
|---|---|---|
| Documento enviado a revisión | revisor(es) del paso activo | los mismos |
| Revisión aceptada, pasa a aprobación | aprobador(es) del paso activo | los mismos |
| Documento devuelto con motivo | autor | autor, con el motivo |
| Documento aprobado | — | propietario y autor |
| Documento retirado | — | propietario y autor |

Al devolver, las tareas que quedaban pendientes de esa ronda se **cancelan**:
el documento vuelve a manos del autor y ya no hay nada que decidir.

Al reenviar, la tarea de corrección del autor se marca **hecha**: no se deja
pendiente algo que ya se hizo.

---

## 8. Mis tareas

`/quality/tasks` — dos listas separadas (tareas y alertas) más las tareas
cerradas recientemente. Cada tarea lleva al documento exacto, en el punto
exacto donde hay que decidir.

La portada de Quality muestra un resumen mínimo —«3 documentos por revisar»—
y **solo si hay algo pendiente**: una tarjeta que siempre dice «0 pendientes»
enseña a ignorarla.
