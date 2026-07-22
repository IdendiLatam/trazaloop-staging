# Trazaloop Textil · Reporte de implementación Sprint T2

> Sprint T2 — Diagnóstico Textil. Implementado sobre el resultado de T1 según
> `TEXTILES_DIAGNOSTIC_MODEL.md` (DL-09) y el roadmap.

## 1. Qué se implementó

**Diagnóstico inicial de Trazaloop Textil**, propio del sector confección, dentro
del namespace privado `/textiles` (mismo triple control de T1: flag
`TEXTILES_MODULE_ENABLED` + organización activa + habilitación en
`organization_modules`; las server actions lo re-verifican por su cuenta).

- **Modelo**: 12 dimensiones (pesos que suman 100) × 58 preguntas propias con
  `standard_refs` (catálogo N-01…N-17), acción recomendada por pregunta,
  6 críticas (TQ01, 06, 12, 18, 23, 56 — sin opción "No aplica") y 1 pregunta de
  contexto (TQ49: "No" no penaliza y vuelve "No aplica" TQ50–52). Cobertura de
  las 17 áreas del encargo verificada en el modelo (§4 del documento, incl.
  madurez digital → D11).
- **Escala**: Sí (1.0) · Parcial (0.5) · No (0.0) · No aplica (excluida del
  denominador) — deliberadamente distinta del booleano CPR.
- **Cálculo (función pura, `lib/domain/textiles-diagnostic.ts`)**: puntaje por
  dimensión sobre peso aplicable; global ponderado por peso de dimensión
  excluyendo dimensiones completas en No aplica; crítica en "No" limita su
  dimensión a 49 (techo de Básico) **y** el nivel global a "Básico"; niveles
  Inicial 0–24 · Básico 25–49 · Intermedio 50–69 · Avanzado 70–84 · Preparado
  85–100, con recomendación general por nivel.
- **Rutas**: `/textiles/diagnostic` (introducción, estado, wizard por dimensiones
  con guardado parcial, finalizar, avisos de no certificación y de evaluación
  interna) y `/textiles/diagnostic/results` (puntaje global, nivel, barras por
  dimensión con marca "Limitada por brecha crítica", brechas principales
  ordenadas —críticas → No → Parcial—, recomendación general, fecha de última
  actualización, estado Borrador/Finalizado y advertencia obligatoria). El shell
  `/textiles` muestra ahora la tarjeta funcional "Diagnóstico Textil".
- **Plan Demo**: puede completar el diagnóstico y ver nivel/puntajes/brechas; el
  texto de acción recomendada por pregunta se gatea con la feature transversal
  existente `diagnostic_recommendations_enabled` (patrón CPR, sin tocar planes).
- **Histórico**: un diagnóstico finalizado no se edita ni se borra (trigger
  transversal reutilizado); se puede iniciar uno nuevo.

## 2. Archivos

**Creados (8):** `supabase/migrations/0071_textile_diagnostic.sql` ·
`lib/domain/textiles-diagnostic.ts` · `lib/db/textiles-diagnostic.ts` ·
`server/actions/textiles-diagnostic.ts` ·
`components/domain/textiles/diagnostic-wizard.tsx` ·
`app/(app)/(shell)/textiles/diagnostic/page.tsx` ·
`app/(app)/(shell)/textiles/diagnostic/results/page.tsx` ·
`tests/diagnostic/textiles-scoring.test.ts`.

**Modificados (3 + docs):** `app/(app)/(shell)/textiles/page.tsx` (tarjeta
funcional del diagnóstico; futuras secciones quedan en 7) ·
`lib/modules/textiles.ts` (el diagnóstico sale de `TEXTILES_PLANNED_SECTIONS`) ·
`tests/unit/textiles-module.test.ts` (test propio de T1 actualizado: admite la
migración 0071 y el directorio `diagnostic/`) · documentación en
`docs/modules/textiles/` (este reporte + roadmap).

**No tocados:** el diagnóstico CPR completo (`diagnostic_*`, `lib/diagnostic/`,
`server/actions/diagnostic.ts`, su wizard y su seed 0022), planes, TrazaDocs,
onboarding, legal, soporte, `package.json`, configuración y `.env*`.

## 3. Migración 0071 (única del sprint)

Crea `textile_diagnostic_sections`, `textile_diagnostic_questions` (catálogos
globales de solo lectura para clientes), `textile_diagnostics` y
`textile_diagnostic_answers` (org-scoped) con el patrón 0024 completo: RLS
deny-by-default espejo del diagnóstico CPR (escritura de respuestas solo con el
diagnóstico en progreso), `unique(organization_id, id)`, FK compuesta
respuestas→diagnóstico de la misma empresa, triggers `set_updated_at`,
`prevent_organization_id_change`, `lock_completed_diagnostic` (reutilizados, no
modificados) y auditoría. Seed idempotente (`on conflict do nothing`) de las 12
dimensiones y 58 preguntas. **Cero** `alter/drop` sobre objetos existentes; cero
contacto con planes o acceso por módulo.

## 4. Cómo probar

1. Flag + organización habilitada (ver reporte T1 §4) → `/textiles` muestra la
   tarjeta "Diagnóstico Textil".
2. `/textiles/diagnostic` → "Iniciar diagnóstico textil" → wizard TD1…TD12 con
   guardado parcial ("Guardar y continuar"). En TD10, responder "No" en TQ49
   marca TQ50–52 como "No aplica" automáticamente.
3. "Finalizar diagnóstico" exige todas las preguntas respondidas (el servidor lo
   re-verifica y calcula) → redirige a `/textiles/diagnostic/results`.
4. Sin flag o sin habilitación: ambas rutas responden 404 y las actions devuelven
   error de módulo no habilitado.

## 5. Resultados de verificación

| Verificación | Resultado |
|---|---|
| `npm run typecheck` · `npm run lint` · `npm run build` | ✅ (rutas `ƒ /textiles/diagnostic` y `ƒ /textiles/diagnostic/results` registradas) |
| 14 suites CPR (diagnostic, compliance, csv, guided, implementation, imports, team, settings, platform, trazadocs, plans, document-master, support, launch) | ✅ 14/14 sin modificar ningún test CPR |
| `npx tsx tests/diagnostic/textiles-scoring.test.ts` | ✅ 18/18 — escala, NA fuera del denominador, regla de contexto TQ49, tope crítico de dimensión (49) y de nivel, umbrales, ponderación global, completitud, NA inválido, orden de brechas, seed 12/58, no-reutilización de preguntas CPR (comparación literal contra 0022), guard en rutas, advertencia obligatoria, guardas de actions |
| `npx tsx tests/unit/textiles-module.test.ts` | ✅ 11/11 (actualizado) |

## 6. Qué quedó fuera (a propósito)

Catálogos textiles (T3) · productos/referencias/composición (T3/T4) · evidencias
textiles (T5) · TrazaDocs Textil (T8) · pasaporte técnico (T9) · circularidad
(T7) · planes por módulo / Plataforma-M1 · activación pública del módulo. La
sugerencia de estructuras documentales por D11/D12 bajas queda para cuando exista
TrazaDocs Textil (T8).

## 7. Riesgos

| Riesgo | Estado |
|---|---|
| Copia del diagnóstico CPR | Evitado y **verificado por test** (check 15: ninguna pregunta del seed 0022 aparece en 0071). |
| Promesas indebidas en el resultado | Advertencia obligatoria en diagnóstico y resultados; escáner de compliance en verde. |
| Cuestionario largo | Guardado parcial por dimensión y navegación TD1–TD12; validación experta del banco sigue pendiente (Q-16, sesión antes del piloto). |
| Cálculo condicional (TQ49) mal aplicado | Regla implementada dos veces de forma independiente (UI y scoring puro) y cubierta por tests 4–6. |

## 8. Confirmaciones

- ✅ El diagnóstico es propio del sector textil: tablas, preguntas, escala y
  scoring nuevos; **cero** reutilización de tablas o contenido CPR.
- ✅ No se implementaron planes por módulo ni Plataforma-M1; no se construyeron
  TrazaDocs Textil, pasaporte, catálogos, productos ni evidencias.
- ✅ No se activó el módulo públicamente; el triple control de acceso de T1 sigue
  intacto y las actions lo re-verifican.
- ✅ CPR no fue modificado funcionalmente: regresión completa (14 suites) verde.
