# PCR-03.2 · Implementation Report — Ejercicio de trazabilidad

Commit `49581b9 feat(pcr): add pre-audit traceability exercise PCR-03.2` ·
tag `pcr-03.2-ready` · migración única
**0107_pcr032_traceability_exercises.sql**.

Entregado (detalle en PCR-03-IMPLEMENTATION-REPORT §03.2): tabla de
ejercicios con snapshot `pcr_traceability_exercise_v1`, source_hash SHA-256
canónico, inmutabilidad jsonb-minus (patrón 0104 §2e) y DELETE de
finalizados vetado; ensamblador PURO que reutiliza la genealogía PCR-02
(multinivel, ciclos, profundidad 10), los saldos de las vistas 0105, las
evidencias gobernadas 03.1, los requisitos de cliente y el cálculo PCR
(solo lectura); clasificación info/advertencia/brecha con recomendaciones y
resultado interno prudente (complete / complete_with_warnings /
incomplete); acción síncrona draft→completed; UI con selector acotado,
lista paginada, detalle de 13 secciones desde la fotografía y disclaimer
literal; sección «Preparación para auditoría» en el hub de trazabilidad.

Validación: `typecheck` 0 · `lint` 0 · `test:pcr03-2` 21/21 (casos 1–22
del brief con llamadas reales, incluidos ciclo y 15 niveles) · arnés DB con
S13.1–S13.3 en verde. Deuda: ninguna conocida.

**Rev. 03.1–03.3.1:** el ejercicio nace SOLO como borrador vacío
(started_at/by verdad-servidor) y se completa ÚNICAMENTE con la RPC
`complete_traceability_exercise` (flag transaccional 0084): lote y resultado
coherentes, completed_at=now() y source_hash calculado en servidor sobre el
jsonb almacenado. INSERT/UPDATE directos de un completed quedan vetados y la
S13 los ejecuta como ataques. Búsqueda por código de lote server-side
(!inner + ilike saneado) antes de contar/paginar; organization_id inmutable.

---

## Rev. 03.1–03.3.2 — fotografía autoritativa

`complete_traceability_exercise(p_exercise_id uuid)` ya NO acepta snapshot del llamador:
`pcr_build_exercise_snapshot` (0107, interna, EXECUTE revocado) reconstruye el contrato
`pcr_traceability_exercise_v1` desde BD (genealogía multinivel, saldos 0105, evidencias
03.1, requisitos, cálculo 0028 y observaciones con las reglas del dominio); la RPC deriva
resultado/conteos, sella `completed_at` y calcula el `source_hash` en servidor. La acción
solo envía `p_exercise_id`; `buildExerciseSnapshot` queda solo para pruebas del contrato.
Archivar exige admin/quality en las TRES capas (UI conservada, acción y guard 0107) y los
conteos tienen CHECK `>= 0`. Pruebas A1–A5, C1–C4 y E1 en S13 (PostgreSQL 16 real).
