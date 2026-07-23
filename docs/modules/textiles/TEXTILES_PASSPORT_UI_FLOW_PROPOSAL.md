# TEXTILES_PASSPORT_UI_FLOW_PROPOSAL — Flujo de UI del pasaporte (T9B/T9C)

> Propuesta de rutas y experiencia. No se implementa en T9.0. Reutiliza los
> patrones de UI del módulo (shell, `force-dynamic`, paleta ink/paper/loop,
> `Button` variants `primary`/`quiet`, impresión por navegador de TrazaDocs).

## 1. Rutas futuras

```
(shell)/textiles/passports                 → listado
(shell)/textiles/passports/new             → creación con pre-chequeo
(shell)/textiles/passports/[id]            → detalle por secciones
(print)/textiles/passports/[id]/print      → impresión por navegador
```

Todas bajo la triple guarda Textil (`requireTextilesModule` + flag +
`organization_modules.module_code='textiles'`) y `force-dynamic`. En `/textiles`
se añadiría, cuando exista, una card "Pasaporte técnico textil" (hoy es la única
sección planificada restante en `lib/modules/textiles.ts`).

## 2. `/textiles/passports` — listado

Tabla/lista de pasaportes de la organización con: referencia/SKU, lote final (si
aplica), `passport_version`, estado (draft/generated/in_review/
approved_internal/obsolete), fecha de generación, número de brechas por
severidad, y acciones (abrir, nueva versión, imprimir). Aviso de módulo con la
advertencia de "herramienta interna de preparación… no equivale a pasaporte
oficial".

Filtros útiles: por referencia, por estado, por presencia de lote. El vigente de
cada `passport_code` se resalta; las versiones `obsolete` se muestran plegadas.

## 3. `/textiles/passports/new` — creación con pre-chequeo

Pasos:

1. **Seleccionar referencia/SKU** (obligatorio; eje del pasaporte).
2. **Seleccionar lote producido/final** (opcional; habilita la sección de
   trazabilidad). Solo lotes de órdenes de esa referencia.
3. **Seleccionar evaluación de circularidad** (opcional; `completed` sugerida,
   `draft` con advertencia, `archived` desaconsejada). Solo evaluaciones de esa
   referencia.
4. **Pre-chequeo de datos** (lectura, sin escribir): muestra qué secciones
   estarán completas/parciales/pendientes y una vista previa de brechas
   (documento 8) — para que el usuario decida generar ahora o completar datos
   antes.
5. **Generar snapshot**: llama la RPC/action de servidor; crea el registro
   `generated` (v1 o v+1 si ya existe `passport_code` para esa referencia/lote)
   y redirige al detalle.

La generación **no** se bloquea por brechas (el pre-chequeo es informativo).

## 4. `/textiles/passports/[id]` — detalle

- Cabecera: código, versión, estado, referencia/SKU, lote (si aplica), fecha,
  advertencia obligatoria.
- **Alerta de `source_hash`**: si las fuentes cambiaron desde la generación,
  banner "Los datos fuente cambiaron desde que se generó este pasaporte.
  Considere crear una nueva versión."
- Secciones 5.2–5.14 renderizadas desde `snapshot_json`, cada una con su
  `completeness_status` como etiqueta neutra; brechas y resumen ejecutivo al
  final.
- Enlaces vivos a evidencias/referencia/lote/evaluación/documentos TrazaDocs
  (navegación; no altera el snapshot).
- Botones según estado/rol: **enviar a revisión** (draft/generated),
  **aprobar internamente** (in_review/generated → approved_internal;
  admin/quality), **nueva versión** (regenera snapshot como v+1 y marca la
  anterior obsolete), **marcar obsoleto**, **imprimir/exportar**.
- Nota persistente: "Aprobado internamente no significa aprobado por una entidad
  externa."

## 5. `/textiles/passports/[id]/print` — impresión

Vista optimizada para impresión del navegador (`@media print`), **mismo patrón
que TrazaDocs** (sin PDF server-side): logo/nombre/NIT de la empresa, cabecera
del pasaporte, secciones del snapshot, y footer con la advertencia obligatoria y
la fecha de generación. `PrintButton` reutilizado.

## 6. Componentes reutilizables

- Formulario de creación con selects encadenados (referencia → lote →
  evaluación), estilo `TextileEntityForm`.
- Tarjetas de sección neutras (estado como badge).
- Lista de brechas por severidad con color de la paleta (amber/danger para
  warning/critical), sin lenguaje de conformidad.
- Editor de estado (transiciones) estilo `trazadoc-editor.tsx`.

## 7. Lo que NO entra en la UI de T9B/T9C

Sin QR, sin portal/enlace público, sin PDF server-side, sin comparador de
versiones lado a lado, sin firma electrónica, sin exportación normativa. La
impresión por navegador es el único mecanismo de "exportar" inicial. QR/enlace
público se documenta como **T9D** futuro (plan en el prompt T9A).
