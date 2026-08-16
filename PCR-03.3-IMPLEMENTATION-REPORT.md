# PCR-03.3 · Implementation Report — Expediente de preparación de auditoría

Commit `feat(pcr): add audit dossier PCR-03.3` · tags `pcr-03.3-ready` y
`pcr-03-ready` · migración única **0108_pcr033_audit_dossiers.sql**.

Entregado (detalle en PCR-03-IMPLEMENTATION-REPORT §03.3): tabla de
expedientes con código legible EXP-PCR-AAAA-NNNN único por empresa
(secuencia en servidor con reintento), versión única por (org, lote) — cada
generación es una versión nueva; snapshot A–K
(`pcr_audit_dossier_v1`) con el ejercicio como fuente principal, matriz de
evidencias sin signed URLs y disclaimer literal; inmutabilidad jsonb-minus
y DELETE vetado SIEMPRE (sin política de delete); heurística honesta de
«Existen cambios posteriores a esta versión» (solo avisa); impresión por
navegador (PrintButton + no-print, formato A4); archivar reservado a
admin/calidad en dos capas.

Validación: `typecheck` 0 · `lint` 0 · `test:pcr03-3` 18/18 · arnés DB con
S14.1–S14.3 en verde · `test:pcr03` 57/57 integrado en `test:all` (1.624
checks, EXIT 0) · `build` webpack limpio con las rutas nuevas. Deuda:
ninguna conocida.

**Rev. 03.1–03.3.1:** generación en tres capas (acción con rol explícito,
UI sin botón para el consultor, BD con INSERT vetado por trigger) y RPC
`generate_audit_dossier` que re-verifica admin/quality, asigna versión y
código EXP-PCR de forma ATÓMICA (advisory locks por lote y por año — test de
concurrencia real con dos sesiones), sella generated_by/at, calcula el hash
en servidor e inyecta la identidad en la portada. Sin reintentos 23505 en la
acción; organization_id inmutable.

---

## Rev. 03.1–03.3.2 — expediente con contenido verdad-servidor

`generate_audit_dossier(p_output_batch_id uuid, p_exercise_id uuid default null)` ya NO
acepta snapshot: exige un ejercicio de trazabilidad COMPLETADO (explícito o el último del
lote) y construye las secciones A–K en BD desde esa fotografía autoritativa + datos reales
de lote/producto/empresa/perfil, con disclaimer literal, identidad EXP-PCR atómica y
hash de servidor. Sin ejercicio: “Ejecuta primero un ejercicio de trazabilidad para
generar el expediente.” (RPC, acción y UI). Archivar `generated→archived` exige
admin/quality también en BD (guard 0108) y los conteos tienen CHECK `>= 0`.
Pruebas B1–B5, D1–D4 y E2 en S14 + concurrencia C2 (PostgreSQL 16 real).
