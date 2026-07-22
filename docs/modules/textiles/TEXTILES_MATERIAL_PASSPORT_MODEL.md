# Trazaloop Textil · Modelo de pasaporte técnico textil / pasaporte de materiales

> Sprint T0 — Solo documentación. Sin PDF server-side, sin QR, sin migraciones.

## 1. Objetivo

Definir el pasaporte técnico textil (también "pasaporte de materiales preparatorio"):
contenido, estados, versionamiento, campos obligatorios de MVP, presentación e
impresión futura. Es la **salida principal** del módulo.

## 2. Alcance

Estructura del pasaporte y su ciclo de vida. La persistencia es
`textile_material_passports` (`TEXTILES_DATA_MODEL_PROPOSAL.md` §4.17).

## 3. Definición y posicionamiento

El pasaporte técnico es un **consolidado versionado por referencia (y opcionalmente
por lote)** de identificación, composición, cadena de suministro, evidencias,
circularidad, claims y brechas.

- **No es** el Pasaporte Digital de Producto oficial de la UE. Los requisitos
  textiles del DPP dependen de actos delegados del ESPR y estándares armonizados aún
  en desarrollo (incertidumbre normativa declarada, N-01).
- **Sí es** una preparación estructurada: cuando existan requisitos DPP finales, la
  empresa ya tendrá la información organizada y con evidencias.
- El nombre en UI: "Pasaporte técnico textil". Alternativa admitida en textos:
  "pasaporte de materiales (preparatorio)". Nunca "DPP", "pasaporte oficial" ni
  "pasaporte certificado".

## 4. Contenido del pasaporte (bloques)

Cada campo indica: **[MVP-OB]** obligatorio en MVP, **[MVP-OP]** opcional en MVP,
**[FUT]** futuro.

### Bloque A · Identificación
| Campo | Nivel |
|---|---|
| Empresa responsable (nombre, NIT/tax id, país) | MVP-OB |
| Producto (código, nombre, categoría) | MVP-OB |
| Referencia/SKU (código, nombre, versión de ficha) | MVP-OB |
| Colección/línea y temporada | MVP-OP |
| País de confección | MVP-OB |
| Orden y lote (si el pasaporte es por lote) | MVP-OP |
| Identificador interoperable (GS1/otros) | FUT |

### Bloque B · Composición y materiales
| Campo | Nivel |
|---|---|
| Composición de fibras por componente (fibra, %, declarada vs con evidencia) | MVP-OB (al menos tela principal) |
| Materiales principales y secundarios | MVP-OB |
| Avíos y componentes (rol, material, separabilidad) | MVP-OP |
| Clasificación monomaterial/mezcla | MVP-OB (o "No evaluable") |

### Bloque C · Cadena de suministro
| Campo | Nivel |
|---|---|
| Proveedores vinculados (nombre, tipo, país) | MVP-OB (los conocidos) |
| Lotes de entrada relevantes | MVP-OP |
| Procesos internos aplicados | MVP-OP |
| Procesos tercerizados (proceso, tercero, evidencia) | MVP-OP |
| Lotes de salida | MVP-OP |

### Bloque D · Evidencias
| Campo | Nivel |
|---|---|
| Listado de evidencias asociadas (tipo, estado, vigencia, esquema si aplica) | MVP-OB |
| Enlaces internos a la evidencia | MVP-OB (vista interna) |

### Bloque E · Claims declarados
| Campo | Nivel |
|---|---|
| Claims con tipo, texto, alcance, limitaciones y estado de soporte | MVP-OP |
| Advertencia por claim sin soporte | MVP-OB si hay claims |

### Bloque F · Circularidad
| Campo | Nivel |
|---|---|
| Reparabilidad, reutilización, reciclabilidad potencial, dificultad de reciclaje (niveles + "No evaluable") | MVP-OB (con evaluación) |
| Monomaterialidad/mezcla | MVP-OB |
| Recomendaciones de cuidado | MVP-OP |
| Instrucciones de separación | MVP-OP |
| Índice de preparación circular + advertencia | MVP-OP |

### Bloque G · Brechas
| Campo | Nivel |
|---|---|
| Brechas de información y evidencia, con criticidad | MVP-OB |

### Bloque H · Documentos y metadatos
| Campo | Nivel |
|---|---|
| Documentos TrazaDocs Textil relacionados (código, versión, estado) | MVP-OP |
| Fecha de generación, versión del pasaporte, estado | MVP-OB |
| Generado por / aprobado por | MVP-OB |
| **Advertencia de no certificación** (texto fijo) | MVP-OB, no removible |

Texto fijo de advertencia:

> "Este pasaporte técnico consolida información y evidencias registradas por la
> empresa en Trazaloop Textil. No constituye certificación, verificación
> independiente, declaración de conformidad ni el Pasaporte Digital de Producto
> oficial de la Unión Europea."

## 5. Estados y versionamiento

| Estado | Significado | Reglas |
|---|---|---|
| Borrador | Generado, editable en metadatos, snapshot regenerable | Solo visible internamente. |
| En revisión | Enviado a revisión interna (supervisor/calidad) | Snapshot congelado salvo regeneración explícita que vuelve a Borrador. |
| Aprobado internamente | Revisión interna superada | **Snapshot inmutable**; cambios ⇒ nueva versión (v+1) que nace en Borrador. |
| Obsoleto | Sustituido o retirado | Se conserva para trazabilidad; nunca se borra. |

- El snapshot (`snapshot jsonb`) captura los datos en el momento de generación: si la
  composición cambia después, el pasaporte aprobado **no** cambia; la plataforma
  marca "existe información más reciente" y sugiere nueva versión.
- "Aprobado internamente" — el adverbio es parte del nombre del estado a propósito:
  evita confundir con aprobación externa.
- Historial de estados append-only (patrón `trazadoc_status_history`).

## 6. Generación, impresión y exportación

- **MVP**: vista de pasaporte en plataforma + **vista imprimible** vía ruta de
  impresión del navegador (patrón CPR `(print)/audit-support` y `print-button.tsx`):
  sin PDF server-side.
- **Futuro** (fuera de MVP): exportación PDF/JSON, compartición controlada con
  compradores, QR con vista pública reducida (decidir qué campos serían públicos —
  pregunta abierta Q-13/Q-14), alineación con GS1 Digital Link y formatos DPP cuando
  existan estándares armonizados.

## 7. Relación con otros módulos

| Módulo | Relación |
|---|---|
| Composición/componentes | Fuente de bloques B y F. |
| Proveedores/lotes/órdenes | Fuente del bloque C vía `textile_traceability_links`. |
| Evidencias | Fuente del bloque D; estados de evidencia condicionan brechas. |
| Circularidad | Fuente del bloque F (última evaluación aprobada; si solo hay borrador, se indica). |
| TrazaDocs Textil | Bloque H; el procedimiento de pasaporte técnico documenta el proceso interno. |
| Brechas | Bloque G calculado al generar el snapshot. |

## 8. Base normativa y referencias internacionales

| Funcionalidad | Norma o marco de referencia | Cómo se aplica en Trazaloop Textil | Qué NO debe prometer la plataforma |
|---|---|---|---|
| Pasaporte como consolidado de información de producto | N-01 (ESPR/DPP como contexto), N-02 | Estructura preparatoria alineada a categorías de información previsibles (composición, reparabilidad, reciclabilidad, cadena de suministro). | Ser el DPP oficial ni cumplir requisitos que aún no están definidos por actos delegados. |
| Trazabilidad incluida | N-03 (ISO 22095) | Cadena documental de actores, lotes y procesos. | Cadena de custodia certificada. |
| Claims en el pasaporte | N-05 (ISO 14021) | Claims con soporte, alcance y limitaciones; advertencia si no soportados. | Validez o verificación de claims. |
| Identificación futura / QR | N-15, N-16 (GS1) | Solo referencia futura declarada. | Compatibilidad GS1 actual. |
| Cuidado y separación | N-06, N-04 | Bloques informativos del snapshot. | Etiquetado legal. |

## 9. Riesgos

| Riesgo | Mitigación |
|---|---|
| El cliente presenta el pasaporte como certificado | Advertencia fija no removible en toda vista/impresión; estado "Aprobado internamente". |
| Snapshot divergente de datos vivos | Marca de desactualización + versión nueva sugerida. |
| Estructura futura del DPP distinta a la propuesta | `snapshot jsonb` versionado con `schema_version` interno para migrar formatos. |
| Pasaportes por lote vs por referencia mezclados | `output_batch_id` nulo = pasaporte de referencia; la UI etiqueta el tipo siempre. |

## 10. Criterios de aceptación

- [ ] Todos los bloques A–H definidos con nivel MVP-OB/MVP-OP/FUT.
- [ ] Estados y regla de inmutabilidad de aprobado especificados.
- [ ] Advertencia de no certificación presente y obligatoria.
- [ ] Impresión MVP definida sin PDF server-side.

## 11. Próximos pasos

1. Resolver Q-12/Q-13/Q-14 (interno vs público futuro) antes de diseñar T9.
2. Definir `schema_version` inicial del snapshot al comienzo de T9.
3. Prototipar la vista imprimible con datos de una empresa piloto en T9.
