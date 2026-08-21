# QUALITY-02 · Modelo documental

**Sprint:** QUALITY-02 — Control documental, aprobaciones, Lista Maestra y PDF
**Migración:** `0116_document_control_revisions_workflow_and_tasks.sql`
**Decisiones ancladas:** D-01 · D-02 · D-03 · D-05 · D-06 · D-08 · D-09 · D-10 ·
D-13 · D-15 · D-16 · D-17 · D-23 · MDR-07 · MDR-08 · MDR-16 · MDR-33 · MDR-44 ·
MDR-50

---

## 1. El defecto que este sprint corrige

Hasta QUALITY-01.2, tres conceptos vivían en dos columnas de
`trazadoc_documents`:

```
status           →  estado del workflow
current_version  →  ¿versión? ¿revisión? ¿instantánea?
```

`change_trazadoc_document_status` (0046, corregida en 0047) hacía
`current_version = current_version + 1` en **cada transición de estado**. El
resultado, comprobado en la prueba humana:

| Acción                | Revisión mostrada |
|---|---|
| Crear documento       | v1 |
| Enviar a revisión     | v2 |
| Rechazar              | v3 |
| Corregir y reenviar   | v4 |
| Aprobar               | v5 |

Cinco «versiones» sin que el contenido hubiera cambiado nunca de revisión. Eso
no es control documental: es un contador de transiciones con nombre equivocado.

---

## 2. La separación

```
DOCUMENT IDENTITY          ≠   DOCUMENT REVISION        ≠   WORKFLOW STATE
trazadoc_documents             trazadoc_document_           .workflow_state
código, título,                revisions                    borrador → revisión
propietario, módulo,           revision_number,             → decisión →
disposición                    contenido, vigencia          aprobado
```

- **Identidad**: estable. Nunca cambia de número, ni se recicla un código (D-04).
- **Revisión**: identidad + revisión inmutable (MDR-08). Solo avanza con una
  acción explícita de una persona.
- **Workflow**: el estado de la revisión ABIERTA. Se mueve muchas veces dentro
  de una misma revisión.

---

## 3. Los dos mundos conviven: `revision_model`

Columna nueva en `trazadoc_documents`, con `default 'legacy'`.

| `revision_model` | Quién lo usa | Qué significa `current_version` |
|---|---|---|
| `legacy` | PCR, Textiles, y los documentos de Quality creados antes de este sprint | Contador técnico de instantáneas. La RPC histórica lo incrementa en cada transición. **Su valor histórico es genuinamente incierto.** |
| `controlled` | Documentos nuevos de Quality | **La revisión de negocio.** Solo la mueve `trazadoc_create_document_revision`. |

Ninguna fila existente cambia de comportamiento: la columna nace con el valor
que preserva lo anterior, y un trigger impide cambiar de modelo después de
crear el documento.

### 3.1 Compatibilidad legacy: qué NO se hizo

El encargo pedía explícitamente no inventar histórico. **No se reinterpretó
ningún `current_version` heredado como una revisión de negocio.** Un documento
legacy con `current_version = 4` se presenta como `v4 (histórico)` —nunca como
«Revisión 4»— y la vista lo marca con `legacy_revision_uncertain = true`.

No hubo backfill de revisiones. Reconstruir a partir de
`trazadoc_document_versions` habría sido posible mecánicamente y falso
materialmente: esas filas registran transiciones de estado, y no existe dato
alguno que permita saber cuáles de ellas correspondían a un cambio real de
revisión documental.

---

## 4. Dónde vive el contenido

```
Revisión ABIERTA      →  trazadoc_document_sections   (contenido vivo, editable)
Revisión APROBADA     →  revisión.content_snapshot    (congelado, inmutable)
```

La revisión abierta **no duplica** el contenido: sus secciones son las que el
motor TrazaDocs ya editaba, con el editor que ya existía (MDR-50, «capture
once»). Al aprobarse, el contenido se congela en `content_snapshot` y la fila
pasa a ser inmutable (D-02), garantizado por trigger.

Crear la revisión N+1 **deriva** su contenido de la anterior sin copiarlo: las
secciones vivas ya SON, exactamente, el contenido congelado —la RLS de 0047 y
el trigger de 0083 impiden editarlas mientras el documento está aprobado, así
que no pueden haber derivado—. La revisión anterior conserva su propio snapshot
y queda histórica.

---

## 5. La garantía, en la base y no en la aplicación

Un trigger sobre `trazadoc_documents` impide que `current_version` cambie en un
documento controlado **salvo** que la transacción lleve la marca
`trazaloop.revision_bump`, que solo pone
`trazadoc_create_document_revision`.

Consecuencia deliberada: llamar a la RPC histórica
`change_trazadoc_document_status` sobre un documento controlado **falla**, con
el mensaje

> Un cambio de estado no altera la revisión del documento. La revisión solo
> avanza al crear una revisión nueva.

No es una comprobación de la capa de aplicación: `change_trazadoc_document_status`
es `SECURITY DEFINER` y ninguna RLS la detendría. La marca de transacción es lo
único que distingue la vía autorizada de todas las demás.

---

## 6. Aprobado ≠ vigente (D-06)

`effective_from` y `effective_to` viven en la **revisión** y son fechas de
negocio (MDR-07). La vigencia **no es un estado almacenado**: se deriva
comparando `effective_from` con la fecha actual.

```
Aprobado el 21/08/2026, vigente desde el 01/09/2026

  21/08 … 31/08  →  «Aprobado · pendiente de vigencia»
  01/09 en adelante →  «Vigente»
```

Ningún proceso programado tiene que despertarse para que eso ocurra, y por
tanto no existe el riesgo clásico de un estado almacenado que se queda
desactualizado porque el cron no corrió.

Cuando una revisión posterior se aprueba, la anterior pasa a `superseded` y su
`effective_to` se cierra el día anterior al comienzo de la nueva —nunca antes
de su propio inicio—. Eso permite responder **qué regía en una fecha pasada**
(D-15, MDR-44) con una sola consulta por rango.

---

## 7. Tablas nuevas

| Tabla | Qué es | Escritura |
|---|---|---|
| `trazadoc_document_revisions` | La revisión documental (MDR-08) | Solo RPC; UPDATE directo limitado a la ficha de vigencia de una revisión abierta |
| `trazadoc_document_workflow_participants` | Revisores y aprobadores de una revisión y una ronda (D-18, D-19) | Solo RPC |
| `trazadoc_document_decisions` | Actos formales, append-only (D-20, MDR-49) | Solo RPC. Sin políticas de UPDATE ni DELETE |
| `work_tasks` | Bandeja transversal de tareas (AT-10, MDR-27) | Solo RPC |
| `work_alerts` | Objeto persistente de atención (AT-12) | Solo RPC; el destinatario cambia su propio ESTADO y nada más |

Y una vista: `v_trazadoc_document_control`, la Lista Maestra **derivada**
(D-13, MDR-16), con `security_invoker = true`.

### 7.1 Columnas añadidas a `trazadoc_documents`

Todas aditivas, con valor por defecto seguro:

`revision_model` · `disposition` · `owner_position_id` · `current_revision_id` ·
`retired_at` · `retired_by` · `retirement_reason`

`owner_position_id` implementa D-17 y MDR-33: la responsabilidad **persistente**
apunta a un CARGO; los actos históricos (quién aprobó) apuntan a la persona
real. `owner_id` se conserva intacto para los módulos que no tienen cargos.

---

## 8. Disposición final (D-10 · D-23)

```
active  →  superseded   (una revisión posterior ocupó su lugar)
        →  retired      (se sacó del uso, conservando todo)
        →  archived     (reservado; no se usa todavía)
```

Un documento con historia formal **nunca** se destruye. La eliminación física
existe y está acotada al único caso en que no hay nada que conservar: un
borrador que jamás fue enviado, aprobado ni asociado a un proceso. Cualquier
otra situación devuelve el motivo exacto por el que debe conservarse, y la
interfaz lo muestra.

Un rechazo YA ES historia formal (D-20): un borrador que fue enviado y devuelto
se retira, no se elimina.

---

## 9. Lo que NO entra en este sprint

- Documentos externos como objetos controlados (D-21).
- Registros y plantillas como entidades propias (D-22, MDR-15).
- Análisis de impacto al cambiar un documento (D-07, D-25).
- Lectura obligatoria, formación y competencia derivadas de una revisión (D-12).
- Rutas condicionales o delegación en el workflow.
- Notificación por correo. La alerta in-app es lo que este sprint entrega.
