# Sprint T7.1 — Hardening de creación de evaluaciones de circularidad · Reporte

Fecha: 2026-07-18 · Base: Sprint T7 (evaluación de circularidad, 0080).

## 1. Problema identificado

La protección de campos calculados de T7 (`protect_textile_circularity_calculated_fields`, 0080) actúa **solo en BEFORE UPDATE**. Como la política RLS de insert permite crear filas a admin/quality/consultant, un usuario con acceso directo a la API de Supabase podía **INSERTAR** una evaluación que naciera ya `completed` con `circularity_score = 100`, `readiness_level = 'preparado'`, `dimension_scores`, `gaps = []`, `recommendations = []`, `calculated_at`, `completed_at` y `completed_by` fabricados — exactamente el ejemplo del encargo — esquivando por completo el flujo controlado de cálculo/finalización y el snapshot.

## 2. Qué se endureció — migración `0081_textile_circularity_creation_hardening.sql` (única)

Una función + un trigger, nada más:

- **`protect_textile_circularity_assessment_creation()`** — trigger **BEFORE INSERT** sobre `textile_circularity_assessments`. Sin el flag transaccional exige que toda evaluación nazca como **borrador limpio**:
  - `status = 'draft'` (nacer `completed` **o `archived`** queda bloqueado): *"Una evaluación de circularidad debe crearse como borrador. La finalización solo ocurre mediante el flujo controlado."*
  - Los **8 campos calculados** en sus valores vacíos/default — `circularity_score`, `readiness_level`, `calculated_at`, `completed_at`, `completed_by` en NULL y `dimension_scores`/`gaps`/`recommendations` en `{}`/`[]` (comparación por `coalesce` contra el default jsonb, robusta ante NULL explícito): *"Los campos calculados… no pueden fijarse al crearla. Deben calcularse desde sus respuestas y datos."*
- Respeta el **mismo flag** de 0080 (`trazaloop.textile_circularity_calculate = 'on'`, local a la transacción) que solo fijan las funciones controladas — una única vía en INSERT y UPDATE. El guard solo LEE el flag, nunca lo fija.
- Sin `security definer` (trigger sobre su propia tabla), con `search_path = public` y execute revocado.
- **0080 queda intacta**: su trigger de UPDATE, el snapshot de `completed`, el guard de respuestas, las RPCs y la RLS no cambian. Aplica también a service_role (los triggers no se saltan con la service key).

## 3. Cambios de código

Ninguno funcional. La server action de creación **ya insertaba solo campos seguros** (código, referencia, lote, fecha, notas); se añadió un comentario vivo que documenta que la BD ahora lo garantiza. Los pins de tres suites se actualizaron con justificación:

| Test | Cambio | Justificación |
|---|---|---|
| `tests/circularity/textiles-circularity.test.ts` check 1 | "después de 0079 solo 0080" → **slot 0080 propio** | La deriva de pins corregida en T2.1–T6.1: el pin al rango abierto rompe con cada sprint legítimo. |
| `tests/traceability/textiles-traceability-hardening.test.ts` check 1 | lista `[0079, 0080]` → **slot 0079 propio** | Ídem — la lista explícita también rompía; cerrada la deriva de una vez. |
| `tests/unit/textiles-module.test.ts` check 10 | lista exacta 0070–**0081** | Inventario de migraciones textiles (intencionalmente exacto). |

Nueva suite: `tests/circularity/textiles-circularity-hardening.test.ts` (**12 checks**: única migración; 0080 intacta; solo función+trigger; solo tabla textil; BEFORE INSERT; borrador obligatorio; 8 campos bloqueados incl. jsonb; mismo flag sin fijarlo; search_path+revoke sin definer; action limpia; sin service_role ni cambios RLS; lenguaje prudente). Scripts: `test:textiles-circularity` y `test:textiles-circularity-hardening` encadenados a `test:all`.

## 4. Cómo probar (validación manual)

1. **Riesgo del encargo**: ejecutar el INSERT del ejemplo (evaluación `completed` con score 100) por SQL o API → falla con *"debe crearse como borrador"*; sin status pero con `circularity_score` → falla con *"no pueden fijarse al crearla"*.
2. **Flujo legítimo**: crear desde `/textiles/circularity/assessments/new` → nace draft limpia; responder, **Calcular** y **Finalizar** siguen funcionando (las funciones controladas operan bajo el flag).
3. **UPDATE**: manipular una completed sigue bloqueado por 0080 (regresión).

## 5. Verificación

typecheck ✓ · lint ✓ (solo el warning preexistente de T5.2) · build ✓ (4 rutas de circularidad) · platform/plans/launch/compliance ✓ · **las 12 suites textiles verdes** (module, catálogos, scoring, hardening T2.1, productos 21, evidencias 21, hardening T5.1 13, inmutabilidad 11, trazabilidad 22, hardening T6.1 14, circularidad 32, **hardening T7.1 12**) · smoke/rls requieren entorno vivo (esperado).

## 6. Riesgos restantes y qué quedó fuera

- El guard no valida contenido de `notes`/`answer_text` (texto libre sin efecto en cálculo) ni el INSERT de respuestas (sin campos calculados; su guard T7 ya exige assessment en draft).
- Fuera por encargo: circularidad adicional ✗ · TrazaDocs Textil ✗ · pasaporte ✗ · QR ✗ · IA ✗ · ACV/huella ✗ · planes por módulo ✗. **CPR sin cambios funcionales** (único objetivo: `textile_circularity_assessments`; verificado por test). **Textil sigue privado** (flag + org activa + `organization_modules.module_code = 'textiles'`; sin `module_key` ni `enabled_by`).
