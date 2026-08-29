# Una sola metodología de contenido reciclado

**Migración:** `0147_recycled_content_methodology_consolidation.sql`
**Fecha:** 2026-08-29 · **Estado:** aplicada en Local y en Staging. Production sigue en 0111.

> Before its first production release, Trazaloop consolidated recycled-content
> calculation into a single traceability-derived methodology.

---

## 1 · La decisión, y por qué se pudo tomar

Trazaloop tiene **una** metodología operativa de contenido reciclado. No hay
selector, no hay «v1» ni «v2» de cara a quien usa el producto, y no hay una
segunda fórmula esperando su turno.

Se pudo tomar porque los cuatro hechos que la sostienen se comprobaron, no se
supusieron:

- **Ninguna empresa real usó la metodología anterior.** Las 190 organizaciones
  de Staging se auditaron una por una con `scripts/qa-consolidate-recycled.ts`:
  todas encajan en un patrón de fixture de QA o de suite automática. Los 22
  cálculos existentes están todos dentro de ellas.
- **Production nunca recibió la convivencia.** Sigue en 0111; las migraciones
  0142–0146, que introdujeron la segunda metodología, no llegaron nunca.
- **Los datos afectados eran exclusivamente QA / pre-release.** Ni un solo
  cálculo empresarial que preservar.
- **Por eso no se creó deuda de compatibilidad innecesaria.** Mantener dos
  motores «por compatibilidad» habría sido pagar compatibilidad con nadie:
  con fixtures propios, que se regeneran.

## 2 · La fórmula, que es la única

```
NUMERADOR    Σ consumo_real_i × φ_i
DENOMINADOR  Σ consumo_real_i
% reciclado  NUMERADOR / DENOMINADOR × 100
```

Con las condiciones ya congeladas en PT-02A: evidencia aplicable en la fecha
del lote, vigencia histórica, confirmación humana del vínculo, unidades
comparables, estado `incomplete` cuando falta un dato determinante y nivel de
defendibilidad separado del resultado. **Sin composición manual.**

## 3 · Cómo se elige el algoritmo, que es la mitad que había fallado

El motor anterior resolvía su metodología con `where code = … and is_active`.
Cuando 0144 desactivó la versión 1 y activó la 2, esa línea pasó a devolver la
2: el motor antiguo siguió ejecutando su código pero **estampando el
identificador y las reglas de una metodología que no era la suya**. Se comprobó
en Local: 29 filas con `methodology_version = 1` apuntando a la fila de la 2.

El fallo no era de una función: era de la *forma de elegir*. `is_active`, «la
última» y `max(version)` son tres maneras de que el algoritmo cambie sin que
nadie lo decida.

0147 lo sustituye por un puntero explícito:

```sql
create or replace function public.recycled_content_canonical_methodology() …
  select * from public.calculation_methodologies
   where code = 'RC-6632-15343' and version = 2;
```

Una futura v3 tendrá que cambiar **esa función**, y eso se ve en una revisión
de código. La prueba `0147-I` lo vigila: la función canónica no puede
mencionar `is_active`, `order by version` ni `max(version)`.

## 4 · Clasificación de los artefactos de la metodología retirada

| Artefacto | Decisión | Por qué |
|---|---|---|
| `calculate_recycled_content(uuid,uuid)` | **REMOVE_NOW** | Tenía `execute` para `authenticated`: un segundo motor ejecutable desde cualquier sesión. Revocarlo lo habría dejado ahí esperando que alguien lo devolviera. Borrada sin `cascade`. |
| Acción `calculateRecycledContentAction` | **REMOVE_NOW** | Su única función era llamar a la anterior. Un muñón exportado es una invitación a recablearlo. |
| `batch_composition` (tabla y filas) | **KEEP_READ_ONLY_TEMPORARILY** | La leen seis vistas —matriz de evidencias, balance de masa, completitud, preparación y los dos tableros—, varias al servicio de otros dominios. Se retiran las tres políticas de escritura y los privilegios `insert/update/delete` de `anon` y `authenticated`. |
| Acciones `add/update/deleteBatchCompositionAction` | **REMOVE_NOW** (ya en PT-02A) | Cerradas antes de tocar sesión o base. |
| `batch_composition` en el importador | **REMOVE_NOW** de la lista ofrecida | Era la puerta trasera al mismo dato. El *tipo* y la *etiqueta* se conservan: hay `import_jobs` históricos que deben poder leerse. |
| `v_output_batch_completeness` | **STILL_REQUIRED_FOR_OTHER_DOMAIN** | La consumen el dossier, la preparación y las brechas. No se toca: es histórica y hay que poder reproducir lo que decía. Su exigencia de composición se descuenta *fuera*, en el dominio y en las brechas. |
| Fila de metodología versión 1 | **REMOVE_NOW si nadie la apunta** | 0147 la borra solo cuando ningún cálculo la referencia. En una base nueva desaparece; en una con histórico sobrevive por integridad referencial, inerte. |
| Reglas (`rules`) de la versión 1 | Se van con la fila | Viven dentro de ella. Los snapshots emitidos llevan su propia copia congelada. |
| `v_calculation_component_rows` | **Corregida** | Ver §5. |
| `v_output_batch_evidence_matrix` | **Corregida** | Ver §5. |
| `v_output_batch_support_gaps` | **Corregida** | Ver §5. |

## 5 · Tres hallazgos que solo aparecieron al dejar una metodología

Los tres eran del mismo tipo: **superficies escritas contra la forma del motor
retirado, que con las dos conviviendo nunca se ejercitaron contra el vigente**.
Ninguno daba error: los tres devolvían vacío, que es la peor forma de fallar.

1. **El dossier técnico salía en blanco.** `v_calculation_component_rows`
   desarma el JSON de componentes y buscaba `mass_kg`, `counted` y
   `exclusion_reason`; el motor vigente escribe `consumed_kg`, `phi` y
   `phi_basis`. Todo dossier nuevo habría salido con la masa vacía y «no
   cuenta» en cada fila. La vista entiende ahora las dos formas, y se le
   añadieron `phi`, `phi_basis`, `input_batch_code` y la fracción declarada,
   que es el dato que explica el número.

2. **La matriz de evidencias no encontraba los materiales.** Llegaba a ellos
   por `batch_composition`. El cálculo vigente llega por orden → consumos →
   lotes de entrada → materiales. Se introdujo `v_output_batch_materials`, que
   responde por los **dos** caminos, para que los lotes nuevos tengan matriz y
   los históricos no la pierdan.

3. **Las brechas de soporte hablaban un idioma que ya nadie habla.** Traducían
   las razones del motor retirado; con el vigente, un cálculo *incompleto* no
   producía ninguna brecha —«no falta nada» sobre un lote que no pudo
   calcularse—. Y arrastraba la regla que P4 quitó de la interfaz: la brecha
   «trazabilidad incompleta» habría saltado en todos los lotes nuevos por no
   tener composición. Ambas cosas corregidas sin tocar 0104.

## 6 · Qué **no** hace 0147

- No borra datos. La limpieza de fixtures QA va en un guion aparte,
  `scripts/qa-consolidate-recycled.ts`, precisamente para que esta migración
  sea segura en una Production que no los tiene.
- No modifica migraciones históricas. No usa `drop … cascade`.
- No toca planes, límites ni módulos (prueba `0147-K`), ni menciona el plan
  Demo en código ejecutable (prueba `0147-L`).
- No cambia la fórmula ni una sola regla de φ, evidencia o defendibilidad
  (prueba `0147-D`).

## 7 · Estado por entorno

| Entorno | Cabecera | Metodologías | Motores |
|---|---|---|---|
| Local (reejecución limpia 0001→0147) | 0147 | **1** (versión 2) | **1** |
| Staging `qchzkxbnbqeyuxinipln` | 0147 | 2 mientras queden 2 cálculos QA que apuntan a la retirada | **1** |
| Production | 0111 | sin cambios | sin cambios |

Una base completamente nueva llega al estado final —una metodología, un motor,
composición de solo lectura— **sin ninguna acción manual**. Así nacerá
Production cuando migre 0111→0147.

## 8 · Lo que se comprueba, y dónde

- `tests/unit/pcr-textiles-02a-recycled.test.ts` · `0147-A` … `0147-L`
- `tests/rls/pcr-textiles-02a-recycled-v2.test.ts` · caso `O` (no queda un
  segundo motor), `P4-d` (la composición no se escribe y el cálculo no la mira)
- `tests/rls/isolation.test.ts` · 31 (una sola metodología y puntero canónico),
  25 y 28 (la composición no se escribe desde ninguna sesión), 39 (dossier,
  componentes, matriz y brechas con el vocabulario vigente)
- `tests/unit/pcr-textiles-preflight.test.ts` · `B5` cazó aquí la misma fuga
  entre inquilinos que costó tres vistas en 0143/0144/0145
