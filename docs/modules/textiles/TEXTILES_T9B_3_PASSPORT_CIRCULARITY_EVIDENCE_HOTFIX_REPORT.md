# Trazaloop Textil · Sprint T9B.3 — Hotfix de evidencias de circularidad auto-seleccionada (Reporte)

> Julio 2026. Hotfix mínimo sobre T9B.2: corrige un detalle de **orden de
> construcción** del snapshot para que las evidencias de una evaluación de
> circularidad auto-seleccionada entren en `snapshot_json.sections.evidences.items`,
> y corrige la ruta en el prompt T9C. **Sin ampliar funcionalidad, sin UI, rutas,
> impresión, PDF, QR, portal, IA, ACV, huella, certificación ni planes por
> módulo.** CPR sin cambios funcionales.

## 1. El problema

En T9B.2 (0090), la RPC `generate_textile_technical_passport_full_snapshot`
construía la sección de evidencias visibles **antes** de auto-seleccionar la
evaluación de circularidad `completed` más reciente. Cuando el pasaporte nacía
sin `circularity_assessment_id`, la variable `v_assessment` aún era `null` al
armar las evidencias, de modo que las evidencias vinculadas a la evaluación que
**luego** se auto-seleccionaba no entraban en
`snapshot_json.sections.evidences.items` — aunque sí quedaban en la sección de
circularidad y, parcialmente, en `data_sources`. Como la UI de T9C mostrará las
evidencias desde `snapshot_json.sections.evidences.items`, debía corregirse.

## 2. La corrección (hotfix mínimo)

Migración `0091_textile_passport_circularity_evidence_hotfix.sql` (única):
**redefine** la RPC con la misma firma y el mismo grant. El único cambio de fondo
es el **orden**: se separa la *resolución* del `circularity_assessment` definitivo
y se ejecuta **antes** del bloque de evidencias:

1. Leer pasaporte, referencia/producto (igual).
2. Composición (igual).
3. **Resolver el `circularity_assessment` definitivo** (nuevo lugar): si el
   pasaporte fijó uno, se usa; si no, se toma la `completed` más reciente de la
   **misma organización y referencia** (`order by completed_at desc nulls last`).
   Se registra si fue manual (`v_assessment_manual`).
4. **Construir evidencias visibles** con el `v_assessment` ya definitivo → el CTE
   captura las evidencias de `circularity_assessment` tanto si fue manual como
   auto-seleccionada.
5. Trazabilidad, y luego la **sección** de circularidad y sus brechas
   (PAS-CIRC-001/002) con el `v_assessment` fijado — sin cambios de lógica.
6. Resto del snapshot, `data_sources` (que ya usaba `v_assessment` para
   `evidences` y `source_records.evidence_links`) y `source_hash`.

También se corrige el flag `circularity_assessment_auto_selected`: ahora se basa
en si el pasaporte traía el id (`not v_assessment_manual`), no en si hay
`assessment_code` (que era `true` también para selección manual).

No cambia la estructura del snapshot, ni las secciones, ni `schema_version`, ni
los estados. El `source_hash` solo cambia por incluir correctamente las
evidencias de circularidad (efecto buscado). No acepta datos de cliente.

## 3. Casos cubiertos

- **Circularidad manual** (`circularity_assessment_id` definido): se usa esa
  evaluación; sus evidencias entran en `snapshot_json.sections.evidences.items`,
  en `data_sources_json.source_records.evidences` y en
  `data_sources_json.source_records.evidence_links`. No se busca otra.
- **Circularidad auto-seleccionada** (sin id): se toma la `completed` más
  reciente de la organización y referencia; sus evidencias entran en las tres
  colecciones. No se genera `PAS-CIRC-001` si existe `completed`. **Este es el
  caso que corrige T9B.3.**
- **Sin `completed`**: si hay `draft`/`in_review` → warning `PAS-CIRC-002`; si no
  hay ninguna → gap `PAS-CIRC-001`. No se inventa score ni assessment; la
  generación no falla.

## 4. Ajuste del prompt T9C (y documentación)

La estructura real del snapshot es `snapshot_json.sections.evidences.items`. El
prompt T9C y algunos reportes decían `snapshot_json.evidences.items`. Se
corrigió la ruta en `TEXTILES_T9C_READY_PROMPT.md`,
`TEXTILES_T9B_2_PASSPORT_SNAPSHOT_CLOSURE_REPORT.md`,
`TEXTILES_T9B_1_PASSPORT_SNAPSHOT_FIXES_REPORT.md`,
`TEXTILES_IMPLEMENTATION_ROADMAP.md` y en los comentarios de la suite T9B.2.
**No se cambió la estructura real del snapshot** para acomodar el prompt viejo:
se corrigió el prompt para que use la ruta real.

## 5. Verificación

- Sintaxis SQL validada con el parser de Postgres (`pglast.parse_sql`) — OK;
  paréntesis balanceados; sin `component_scope = 'main'`; palabra vetada = 0.
- Orden verificado por test: la resolución del assessment ocurre antes de la
  construcción de evidencias; existe una sola resolución; el CTE de evidencias y
  `data_sources` usan `v_assessment` para `circularity_assessment`.
- `npx tsc --noEmit` ✅ · `npm run lint` ✅ (solo el warning preexistente de
  T5.2) · `npm run build` ✅ (sin rutas nuevas). Nueva suite
  `tests/passports/textiles-passports-circularity-evidence-hotfix.test.ts` **14/14**.
- Regresión: familia pasaporte 16/12/11/8/16/14/13/**14**, evidencias 21,
  circularidad 32, trazabilidad 22, TrazaDocs 20, productos 21, **CPR
  `tests/unit/trazadocs.test.ts` ✅**, `test:platform`/`test:plans`/`test:launch`
  ✅, `test:compliance` ✅ (barre 0091). `test:all`: **32 resultados verdes**
  (+1 respecto de T9B.2). `test:smoke`/`test:rls` requieren `.env.local`.

## 6. Validación manual (cuando haya entorno)

1. **Auto-seleccionada**: referencia con una evaluación `completed` que tiene
   evidencias vinculadas (`entity_type = 'circularity_assessment'`), y un
   pasaporte **sin** `circularity_assessment_id`. Generar → esas evidencias
   aparecen en `snapshot_json.sections.evidences.items` y el flag
   `circularity_assessment_auto_selected` es `true`.
2. **Manual**: el mismo pasaporte con `circularity_assessment_id` fijado a esa
   evaluación → mismas evidencias visibles; flag `auto_selected` `false`.
3. **Sin completed**: solo `draft` → `PAS-CIRC-002` y sin evidencias de
   assessment; ninguna → `PAS-CIRC-001`.
4. **Hash**: dos generaciones equivalentes producen el mismo `source_hash`;
   añadir una evidencia al assessment cambia el hash.

## 7. Confirmaciones

Hotfix mínimo: solo se reordenó la resolución de circularidad y se corrigió la
ruta del prompt. Sin ampliar funcionalidad. Sin UI/rutas/impresión/PDF/QR/portal/
IA/ACV/huella/certificación/planes. Sin tablas, columnas ni políticas nuevas
(0091 solo redefine la función); estructura, secciones, `schema_version` y
estados intactos; RLS sin cambios. Solo lectura de los módulos existentes; única
escritura, la fila del pasaporte bajo el flag. **CPR no fue modificado
funcionalmente.** Textil sigue privado. La UI, listado, detalle e impresión
siguen pendientes para **T9C** (`TEXTILES_T9C_READY_PROMPT.md`);
`TEXTILES_PLANNED_SECTIONS` sigue en `["Pasaporte técnico textil"]` hasta T9C.
