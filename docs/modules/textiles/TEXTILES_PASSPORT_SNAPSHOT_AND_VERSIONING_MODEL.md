# TEXTILES_PASSPORT_SNAPSHOT_AND_VERSIONING_MODEL — Snapshot, source_hash y versionamiento

> Decisión central: el pasaporte es un **snapshot** en servidor, no una vista
> viva. Este documento define qué se congela, cómo se versiona, cómo se detecta
> que las fuentes cambiaron y qué estados/transiciones existen.

## 1. Por qué snapshot y no vista viva

Una vista viva recalcularía todo en cada visita: si mañana se acepta una
evidencia, cambia una composición o se recalcula la trazabilidad de un lote, el
pasaporte "emitido" cambiaría retroactivamente y perdería valor probatorio ante
una revisión o auditoría. El pasaporte debe responder *"esto es lo que existía
el día que lo generé"*. Por eso `snapshot_json` congela los datos, y para el
trabajo diario se ofrece navegación viva por enlaces (documento 6, §evidencias)
sin alterar el snapshot.

## 2. Contenido del snapshot

`snapshot_json` (estructura del documento 3) incluye, para cada sección:

- **datos visibles** (los valores mostrados al usuario);
- **IDs fuente** de cada entidad (para navegar a la referencia, evidencia,
  lote, evaluación o documento vivo);
- **fecha de extracción** (`generated_at`);
- **versión de metodología de circularidad** usada;
- **estados de evidencias** al momento (accepted/pending_review/…);
- **estados de documentos** TrazaDocs (borrador/en revisión/aprobado
  internamente/obsoleto) y versión;
- **brechas calculadas** (documento 8);
- **usuario generador**.

`data_sources_json` guarda, por separado, la lista de `{entity_type, id,
updated_at, status?}` de todo lo que alimentó el snapshot — es la materia prima
del hash y la evidencia de procedencia.

## 3. `source_hash` — detección de cambios posteriores

`source_hash` es un hash determinista (p. ej. SHA-256 en servidor) calculado
sobre una serialización canónica y ordenada de `data_sources_json`:

- `reference.updated_at`;
- composición: `updated_at` de cada fila + conjunto de `fiber_type_id`/`%`;
- materiales/componentes: IDs + `updated_at`;
- evidencias vinculadas: IDs + `status` + `updated_at`;
- `output_lot.updated_at` + `traceability_status` (si aplica);
- `circularity_assessment.updated_at` + `status` (si aplica);
- documentos TrazaDocs: IDs de versión aprobada + `status`.

Uso (T9C): al abrir un pasaporte, el servidor recomputa el hash de las fuentes
actuales y lo compara con el guardado. Si difieren, muestra:

> "Los datos fuente cambiaron desde que se generó este pasaporte. Considere
> crear una nueva versión."

El hash **no** se implementa en T9.0; aquí solo se especifica. No dispara
regeneración automática: el usuario decide.

## 4. Versionamiento — un registro por versión

- `passport_code` estable dentro de `(organization_id, reference_id,
  output_lot_id)`; se genera una vez (p. ej. `PAS-<ref>-<lote?>` o secuencial).
- `passport_version` incremental (1, 2, 3…).
- **Crear nueva versión** = insertar un nuevo registro con el mismo
  `passport_code`, `passport_version + 1`, snapshot nuevo, y marcar la anterior
  `obsolete`. El histórico completo queda como registros inmutables.
- El pasaporte "vigente" de una referencia/lote es el de mayor
  `passport_version` cuyo `status != 'obsolete'`.
- No hay tabla de versiones separada (documento 2, §1): cada fila **es** una
  versión.

## 5. Estados y reglas de edición

| Estado | Significado | Snapshot | Quién |
|---|---|---|---|
| `draft` | Preparación inicial (registro creado, aún sin snapshot definitivo) | editable limitado | admin/quality/consultant |
| `generated` | Snapshot creado desde datos fuente | **inmutable** | (lo produce la RPC) |
| `in_review` | En revisión interna | inmutable | admin/quality/consultant envían |
| `approved_internal` | Aprobado internamente (no externo) | inmutable | admin/quality |
| `obsolete` | Reemplazado por nueva versión o retirado | inmutable | admin/quality |

Reglas:

- `generated`, `in_review` y `approved_internal` **no** permiten editar
  `snapshot_json`/`source_hash`/`gaps_json`/… directamente.
- Para cambios sustanciales → **nueva versión** (nuevo registro).
- `obsolete` es terminal (no editable).
- Transiciones válidas: `draft → generated → in_review → approved_internal`, y
  `generated|in_review|approved_internal → obsolete`. Una RPC atómica en
  servidor sella la transición (patrón de `change_trazadoc_document_status`).

## 6. Generación (dónde vive)

El snapshot se arma **exclusivamente en servidor** (RPC/builder de T9A/T9B) bajo
un flag transaccional interno (patrón T7.1). El cliente nunca envía
`snapshot_json`, `source_hash`, `gaps_json`, `warnings_json`,
`recommendations_json` ni sellos. Un pasaporte se puede generar aunque tenga
brechas: la generación no se bloquea (documento 8).

## 7. Relación snapshot ↔ enlaces vivos

- **Snapshot** (`snapshot_json`): verdad histórica, inmutable.
- **Enlaces vivos** (`textile_evidence_links` con
  `entity_type='technical_passport'`): permiten, desde el pasaporte, navegar a
  las evidencias actuales para el trabajo diario. Si una evidencia cambió de
  estado tras la generación, el enlace vivo lo refleja, pero el snapshot
  conserva el estado del momento — y el `source_hash` desactualizado lo delata.
