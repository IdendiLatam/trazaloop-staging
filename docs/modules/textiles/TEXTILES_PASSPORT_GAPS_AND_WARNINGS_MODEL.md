# TEXTILES_PASSPORT_GAPS_AND_WARNINGS_MODEL — Modelo de brechas y advertencias

> Catálogo de brechas que el builder del pasaporte (T9B) calculará y guardará en
> `gaps_json`. Las brechas **no bloquean** la generación: el pasaporte es, entre
> otras cosas, una herramienta para verlas. Estados y severidades neutrales
> (nunca "cumple/no cumple").

## 1. Forma de una brecha

```
{
  "gap_code": "PAS-COMP-001",
  "severity": "critical" | "warning" | "improvement" | "info",
  "section_key": "fiber_composition",
  "message": "La composición de fibras no suma 100% (±0,5) en el alcance principal.",
  "source_entity_type": "reference_fiber_composition",
  "source_entity_id": "…",
  "recommendation": "Revise los porcentajes por alcance en la referencia.",
  "blocking": false,
  "generated_at": "…"
}
```

Además, la clasificación de presentación del documento 3 §5.13
(`critical` / `warning` / `improvement` / `missing_data` / `not_applicable`)
agrupa estas brechas para la UI; `missing_data` corresponde a severidad `info`
sobre datos ausentes, y `not_applicable` a secciones que no aplican (p. ej.
trazabilidad sin lote).

## 2. Severidades

| Severidad | Significado | ¿Bloquea? |
|---|---|---|
| `critical` | Inconsistencia o ausencia que compromete la lectura técnica | No (se advierte con fuerza) |
| `warning` | Situación que debe revisarse antes de usar el pasaporte externamente | No |
| `improvement` | Oportunidad de fortalecer la documentación | No |
| `info` | Dato faltante o nota contextual | No |

Ninguna brecha bloquea la generación (encargo §8). `blocking` se reserva `false`
en todo el catálogo inicial; el campo existe por si un despliegue futuro quisiera
exigir algo, pero el diseño T9 no lo usa.

## 3. Catálogo inicial de `gap_code`

### Composición (`fiber_composition`)
- **PAS-COMP-001** `critical`: la composición no suma 100 ±0,5 en el alcance
  principal.
- **PAS-COMP-002** `info`: referencia sin composición documentada (normalizado
  en T9B.2; antes PAS-COMP-003).
- **PAS-COMP-003** `warning`: composición que excede 100% en algún alcance
  (`needs_review`) (renumerado en T9B.2; antes PAS-COMP-002).

### Evidencias (`evidences`)
- **PAS-EVID-001** `warning`: declaración reciclada/orgánica sin evidencia
  `accepted` ni `pending_review`.
- **PAS-EVID-002** `warning`: evidencia de soporte en estado `expired` (genera
  advertencia).
- **PAS-EVID-003** `info`: material/componente sin ninguna evidencia vinculada.

### Claims (`claims`)
- **PAS-CLAIM-001** `warning`: claim ambiental (reciclado/orgánico/
  reciclabilidad/reutilización) sin soporte documental suficiente.
- **PAS-CLAIM-002** `improvement`: claim con soporte solo en `pending_review`
  (aún no aceptado internamente).

### Trazabilidad (`traceability`, solo con lote)
- **PAS-TRACE-001** `warning`: lote final con `traceability_status` =
  `needs_review`.
- **PAS-TRACE-002** `critical`: lote final con `traceability_status` =
  `incomplete`.
- **PAS-TRACE-003** `warning`: sobreconsumo detectado en el balance de lotes.
- **PAS-TRACE-004** `info`: proceso tercerizado sin soporte de ejecución
- **PAS-TRACE-005** `warning`: la orden/corrida del lote no tiene pasos de
  proceso documentados (T9B.2).
  vinculado.

### Circularidad (`circularity`)
- **PAS-CIRC-001** `warning`: no existe una evaluación de circularidad
  `completed` para la referencia.
- **PAS-CIRC-002** `warning`: la evaluación vinculada está en `draft` (se usa con
  advertencia).
- **PAS-CIRC-003** `info`: la evaluación vinculada está `archived` (no
  recomendada).

### Separabilidad / diseño (`care_repair_eol`, `components`)
- **PAS-SEP-001** `improvement`: componentes sin separabilidad evaluada.
- **PAS-SEP-002** `info`: sin información de cuidado documentada (ISO 3758 como
  referencia).
- **PAS-SEP-003** `info`: sin información preliminar de fin de vida.

### Documentación TrazaDocs (`trazadocs`)
- **PAS-DOC-001** `warning`: procedimiento de evidencias textiles (TXT-PRO-004)
  no aprobado internamente.
- **PAS-DOC-002** `warning`: procedimiento de trazabilidad (TXT-PRO-005) no
  aprobado internamente.
- **PAS-DOC-003** `improvement`: procedimiento de circularidad (TXT-PRO-007) no
  aprobado internamente.
- **PAS-DOC-004** `info`: matriz de preparación documental (TXT-MAT-012)
  inexistente o en borrador.

### Datos base (`product_identification`)
- **PAS-DATA-001** `info`: la referencia no tiene producto asociado.
- **PAS-DATA-002** `info`: campos opcionales del producto sin diligenciar
  (mercado objetivo, uso previsto).

## 4. Consolidación en el resumen ejecutivo

El resumen (5.14) deriva el **nivel general de preparación técnica** de la
mezcla de severidades y de los `completeness_status` de sección:

- muchas `critical` → nivel "pendiente" o "requiere revisión";
- solo `warning`/`improvement` → "parcialmente documentado";
- sin brechas relevantes y secciones núcleo completas → "documentado".

Nunca se traduce a "cumple/no cumple". Las fortalezas son las secciones
`documented`; las brechas principales, las `critical`/`warning` de mayor
impacto; los próximos pasos, sus `recommendation`.

## 5. Ejemplos textuales de mensajes (lenguaje prudente)

- PAS-CIRC-001: "No existe una evaluación de circularidad completada para esta
  referencia. Considere realizar una evaluación antes de usar el pasaporte como
  soporte de preparación circular."
- PAS-DOC-001: "El procedimiento de evidencias textiles no está aprobado
  internamente. Complete su revisión interna para fortalecer la preparación
  documental." (Nunca implica aprobación externa.)
- PAS-CLAIM-001: "Se declara contenido reciclado/orgánico sin evidencia
  suficiente. Vincule y acepte internamente el soporte antes de usar el claim en
  comunicaciones externas." (ISO 14021 como referencia.)
