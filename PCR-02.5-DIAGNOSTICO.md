# PCR-02.5 · Diagnóstico

Base: `trazaloop-pcr02_4-source-d0f0ae8.zip` (tag `pcr-02.4-ready`),
verificada byte a byte contra la entrega PCR-02.4. **0104 aplicada en
Production → inmutable**; todo cambio de base nace en la 0105.

## Bloque A · Cantidad producida
- `output_batches.produced_quantity_kg`: `numeric(14,4)` **nullable** con
  `CHECK (is null or > 0)` desde 0025 — la BD aceptaba lotes sin cantidad.
- UI: etiqueta literal «Cantidad producida kg (opcional)» en
  `components/domain/traceability/forms.tsx`.
- Acciones create/update: traducían vacío → `NULL` y solo validaban > 0
  cuando el campo venía informado.
- Importación CSV: `produced_quantity_kg` con `required: false` en la
  plantilla y `normalizeOptionalPositiveNumber` en el validador.

## Bloques B/C/D · Inventario y saldos
- No existía NINGUNA noción de saldo: ni vistas, ni agregados, ni guardas.
  Se podía consumir 101 kg de un lote de 100 (externo e interno), editar un
  consumo por encima del recibido y reducir la cantidad de un lote por
  debajo de lo ya consumido — todo reproducido en PostgreSQL real antes de
  corregir (bugs con evidencia en REVIEW-FIXES).
- Concurrencia: el patrón «SELECT saldo; INSERT» sin serialización permite
  que dos sesiones lean 100 disponibles e inserten 60 + 60.
- Selectores de consumo (PCR-02.1, acotados a 20): ofrecían lotes agotados
  y no informaban saldo.
- FK `batch_consumption → input_batches` es **on delete restrict** (0025):
  ningún consumo desaparece en cascada al borrar lotes. ✔ conservado.

## Bloque E · Transparencia del cálculo PCR
- La lógica REAL (0028 `calculate_recycled_content` + `lib/db/recycled.ts`)
  YA modela `counted`/`exclusion_reason` (incluida «Sin evidencia de
  soporte de origen»), distingue evidencia de clasificación
  (`never_counts`, reclasificación, soporte de origen) y el detalle del
  cálculo y el dossier YA muestran ¿Cuenta?/Razón por fila.
- **Regla del denominador (§20) confirmada literalmente**: en 0028 el loop
  de componentes ejecuta `v_total := v_total + comp.mass_kg;` como PRIMERA
  sentencia, incondicional; el numerador solo suma bajo `if v_counted`.
  El material sin evidencia PERMANECE en la masa total. No se toca la
  metodología.
- Brecha real detectada: el RESUMEN (porcentaje grande) no explicaba por
  qué la masa excluida reduce el porcentaje → nota UX nueva.

## Decisiones (resumen)
Inventario **derivado** (3 vistas `security_invoker`, sin tabla de stock);
anti-sobreconsumo con **trigger BEFORE + `SELECT … FOR UPDATE` del lote
padre** (serialización real; justificación en IMPLEMENTATION-REPORT);
nombres `t_*_total_balance_guard` para que los structural guard PCR-02.4
('structural' < 'total') sigan mandando sobre órdenes cerradas; estados
solo Disponible/Agotado (§18); selectores desde las vistas con
`available_kg > 0` y saldo en la etiqueta.


## Apéndice PCR-02.5.1 (revisión adversarial independiente)
Tres hallazgos sobre la entrega PCR-02.5, confirmados en código antes de
corregir: (1) `updateOutputBatchAction` capturaba cualquier 23514 como
reasignación — el piso de cantidad de la 0105 llegaba con un mensaje
semánticamente falso; (2) el inventario truncaba en 200 materiales / 100
lotes sin búsqueda, paginación, total ni aviso; (3) la 0105 no hacía
preflight del sobreconsumo histórico y podía activar vistas con saldo
negativo. Correcciones en REVIEW-FIXES; la 0105 aún no desplegada se
corrige en sitio (sin 0106).

## Apéndice PCR-02.5.2
Un único bloqueo de despliegue sobre la entrega 02.5.1: la 0105 embebía
BEGIN/COMMIT top-level, incompatibles con el runner de migraciones de
Supabase CLI. Corregido: sin transaction control en el archivo, LOCK
conservado como primera protección y atomicidad delegada al ejecutor
(CLI / `psql --single-transaction`). Guía de deploy reescrita al flujo de
migraciones (sin SQL Editor) y redacción de locks vuelta prudente.
