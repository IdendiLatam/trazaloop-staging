# PCR-03 · Review Fixes — rev. 03.1–03.3.1 «Security & Integrity Closure»

El paquete PCR-03.1–03.3 original fue clasificado **NO-GO**. Esta revisión
reconoce ONCE hallazgos (10 del brief + higiene) y documenta su cierre REAL:
cada afirmación de abajo tiene una prueba ejecutada que la respalda (arnés
PostgreSQL 16 `tests/db/run-local-pg.sh`, 13/13 pasos EXIT 0, o suites unit).

## Hallazgos de la revisión y su cierre

**1 · evidence_links + customer_requirement (BLOQUEANTE).** El enum se
amplió en la 0106 original pero `validate_evidence_link_org()` (nacida en
0020, vigente por 0025) conservaba un CASE sin `customer_requirement`: todo
INSERT real era rechazado. CIERRE: 0106 redefine la función ADITIVAMENTE
(`case new.target_type::text` + rama a `customer_requirements`, mismos
SECURITY DEFINER/search_path/EXECUTE revocado; el trigger
`t_evidence_links_same_org` no se toca). El arnés ahora CABLEA ese trigger
real (preludio) y S12.4 ejecuta los cuatro casos: misma org OK, org ajena
rechazada («Enlace de evidencia entre empresas bloqueado…»), requisito
inexistente rechazado, y los ocho tipos históricos siguen validando.

**2 · Metadatos de evidencia perdidos (BLOQUEANTE).** `LinkedEvidence` no
consultaba `medium`/`archived_at`/`physical_reference` y el colector 03.2
los "recuperaba" con casts sobre campos inexistentes. CIERRE: el contrato
tipa y transporta los tres campos, el SELECT los consulta y el colector los
usa sin casts. Prueba: candado unit (SELECT + tipo + sin `(e as {…})`) y la
suite de dominio existente demuestra physical→physical, hybrid→hybrid,
archivada/rechazada NO vigentes y storage_path jamás inventado.

**3 · Sellos de revisión falsificables (BLOQUEANTE).** `guard_evidence_review`
solo sellaba EN la transición: un UPDATE sin transición podía reescribir
`reviewed_at/by`, `review_comment`, `archived_by`. CIERRE: sin transición,
los cinco sellos se preservan del histórico (`new.x := old.x`, fail-closed
incluso para admin); con transición los fija el servidor (`now()`/
`auth.uid()`); rejected→pending (reapertura) queda reservado a admin/quality
y limpia el veredicto. S12.1b (ataque 33), S12.1c (ataque 7) y S12.3
(ataque 34) EJECUTAN las falsificaciones y verifican el rechazo/preservación.

**4 · organization_id inmutable (BLOQUEANTE).** Las cuatro tablas nuevas
carecían del candado 0024. CIERRE: `prevent_organization_id_change()` en
customer_requirements, customer_requirement_links, traceability_exercises y
audit_dossiers. S12.4/S13.2/S14.2 ejecutan el move A→B con un usuario
miembro de AMBAS organizaciones (ataque 35): rechazado con el mensaje 0024.

**5 · Ejercicio fabricable vía REST (BLOQUEANTE).** La RLS de 0107 permitía
insertar un `completed` con snapshot/hash/resultado arbitrarios. CIERRE
(patrón de flag transaccional 0084): trigger de INSERT (solo borrador vacío;
`started_at/by` verdad-servidor), trigger de UPDATE (campos calculados solo
bajo `trazaloop.exercise_complete`, única excepción la transición pura
completed→archived) y RPC `complete_traceability_exercise` — membresía,
draft obligatorio, snapshot del MISMO lote, resultado coherente con brechas/
advertencias, `completed_at = now()` y `source_hash` calculado EN SERVIDOR
sobre el jsonb almacenado. La S13.3 anterior (que insertaba un completed y
lo daba por bueno) fue REESCRITA: ese ataque ahora debe fallar (S13.1) y el
flujo legítimo se demuestra por la RPC. La Server Action usa la RPC.

**6 · Expediente fabricable vía REST (BLOQUEANTE).** La RLS de 0108 permitía
a cualquier miembro insertar un `generated`. CIERRE en tres capas: acción
(`org.roleCode === "admin" || "quality"` explícito), UI (el consultor no ve
«Generar»; aviso en su lugar) y BD (INSERT vetado por trigger salvo flag de
la RPC `generate_audit_dossier`, que re-verifica el rol con `has_org_role`,
sella `generated_by/at`, calcula el hash en servidor e inyecta código/
versión/autor en la portada). S14.1 ejecuta el INSERT directo como consultor
Y como admin (ambos rechazados), la RPC como consultor (rechazada por rol) y
el flujo legítimo.

**7 · Bidireccionalidad del requisito (BLOQUEANTE).** `TARGET_TYPE_LABEL`,
`targetHref` y `listEvidenceUsage` ignoraban `customer_requirement`
(«Registro no disponible»). CIERRE: etiqueta humana «Acuerdo / requisito de
cliente», etiqueta de registro `cliente · código — título`, navegación a
`/catalog/customer-requirements?focus=<id>#registro-<id>` y la página
resuelve `?focus=` fijando el registro aunque caiga fuera de la página
(patrón PCR-01.1). Acotado por organization_id como el resto.

**8 · Búsqueda/paginación de ejercicios (BUG).** El filtro `q` se aplicaba
en JavaScript SOBRE la página de 20. CIERRE: `ilike` sobre
`output_batches.batch_code` con join `!inner`, ANTES de `count`/`range`;
`%`/`_` saneados; el total representa el resultado filtrado; PAGE_SIZE=20.
Candados unit verifican el ilike servidor y la ausencia del filtro JS.

**9 · Concurrencia de versionado (BUG).** `nextVersion` se calculaba una vez
y el reintento por 23505 lo reutilizaba. CIERRE: la asignación vive en la
RPC bajo `pg_advisory_xact_lock` por (org, lote) —versión— y (org, año)
—secuencia EXP-PCR—; la acción ya no reintenta. PRUEBA REAL:
`tests/db/pcr03_dossier_concurrency.sh` (paso 13/13) lanza DOS sesiones
psql simultáneas contra el mismo lote → versiones consecutivas, códigos
distintos, cero duplicados.

**10 · Regresión T9F (RESTAURADA).** t9f5b1 recuperó la aserción histórica
`MIG100.includes("create or replace function
public.resolve_organization_module_access")`; la frontera de migraciones
0106–0108 se mantiene sin debilitar ningún check histórico (21 ✔).

**11 · Higiene del paquete.** Los artefactos `run` y `test:textiles-rls-t9e2`
(logs históricos) se eliminaron del árbol y no viajan en el ZIP; exclusiones
de secretos/builds intactas.

## Revisión adversarial (30 originales + 31–40)

Las 30 comprobaciones originales se re-ejecutaron desde el árbol corregido
(suites pcr03-1/2/3 + arnés). Las diez nuevas: **31** completed fabricable
vía REST → NO (S13.1, INSERT y UPDATE rechazados); **32** generated
fabricable vía REST → NO (S14.1, consultor y admin); **33** reviewed_by sin
transición → NO (S12.1b); **34** archived_by falsificable → NO (S12.3);
**35** organization_id movible por usuario de dos orgs → NO (S12.4/S13.2/
S14.2); **36** física convertida en digital → NO (contrato explícito +
dominio; physical se preserva en snapshot); **37** archivada vigente en
snapshot → NO (dominio la excluye de vigentes; candado + suite); **38**
evidencia→requisito rechazado por el trigger antiguo → CERRADO (función
redefinida y ejercitada por el trigger REAL en el arnés); **39** búsqueda
solo de la página actual → CERRADO (ilike servidor antes de paginar); **40**
carrera de versión de expediente → CERRADA (advisory locks + test de
concurrencia real 13/13).

Resultados verificables: `PCR-03-FINAL-VALIDATION.txt` (árbol) y
`SHA256SUMS.txt` junto al ZIP (hash del artefacto).


---

## Revisión 03.1–03.3.2 — Authoritative Snapshot & Role Closure (2026-08-15)

Veredicto previo: NO-GO. Cierre adversarial sobre `trazaloop-sprint-PCR-03.1-03.3.1.zip`.
Correcciones EN SITIO sobre 0106/0107/0108 (PCR-03 sin integrar); sin 0109; 0001–0105 intactas.

### Hallazgo 1 (bloqueante) — El snapshot del ejercicio era fabricable
La RPC aceptaba `p_snapshot jsonb`: cualquier miembro autenticado podía declarar el
contenido histórico por REST (el hash de servidor solo certificaba contenido posiblemente
falso). **Cierre:** `complete_traceability_exercise(p_exercise_id uuid)` SIN snapshot del
llamador; nueva `public.pcr_build_exercise_snapshot(p_org, p_output_batch_id)` (0107,
SECURITY DEFINER, EXECUTE revocado a clientes) reconstruye la fotografía COMPLETA
`pcr_traceability_exercise_v1` desde fuentes autoritativas: lote objetivo + producto,
genealogía multinivel (batch_consumption / output_batch_consumption, ciclos por camino,
profundidad 10, nivel mínimo — equivalente BFS de PCR-02), saldos de las vistas 0105,
evidencias gobernadas 03.1 de lotes/órdenes/entradas/materiales/proveedores, requisitos
de cliente, cálculo PCR (0028, solo lectura) y observaciones clasificadas con las mismas
reglas prudentes del dominio 03.2. La RPC deriva resultado/conteos de esa fotografía,
sella `completed_at = now()` y calcula `source_hash` sobre el jsonb del SERVIDOR. La
Server Action solo indica el borrador (`p_exercise_id`); `buildExerciseSnapshot` (TS) se
conserva únicamente para las pruebas del contrato — ya no es fuente de verdad.
Pruebas: A1 (firma vieja → `undefined_function`), A2 (imposible por firma), A3 (la
fotografía refleja cadena/saldos/evidencias/conteos REALES), A4 (datos nuevos → fotografía
nueva; la histórica y su hash intactos), A5 (hash = sha256 del snapshot del servidor).

### Hallazgo 2 (bloqueante) — El snapshot del expediente era fabricable
`generate_audit_dossier` aceptaba `p_snapshot`. **Cierre:** firma
`generate_audit_dossier(p_output_batch_id uuid, p_exercise_id uuid default null)`; el
contenido A–K se construye EN BD desde el ejercicio COMPLETADO e inmutable (autoritativo
tras el hallazgo 1) + datos reales de lote/producto/empresa/perfil: portada, resumen,
genealogía, balances, cálculo, evidencias, requisitos, calidad/NC/reclamos, sección del
ejercicio (duración ≥ 1 s, hash), hallazgos mapeados y disclaimer literal. **Integridad
primero:** sin ejercicio completado NO hay expediente —
“Ejecuta primero un ejercicio de trazabilidad para generar el expediente.” (RPC, acción y
UI). Rol admin/quality, advisory locks, versión/código atómicos y sellos de servidor se
conservan. Pruebas: B1 (firma vieja → `undefined_function`), B2 (imposible por firma),
B3/B4 (contenido desde el ejercicio real; secciones A–K + disclaimer presentes), B5 (hash
del servidor), y el caso sin ejercicio.

### Hallazgo 3 (bloqueante) — consultant archivaba expedientes por REST
La policy de UPDATE alcanza a cualquier miembro y el guard permitía `generated→archived`
sin rol. **Cierre (opción A):** el trigger de inmutabilidad exige
`has_org_role(organization_id, array['admin','quality'])` en esa transición
(42501 · “Solo administrador o calidad pueden archivar expedientes.”).
Pruebas: D2 (consultant por UPDATE directo → rechazado), D3 (admin OK), D4 (quality OK);
D1 cubierto por el candado de la acción (rol explícito, ya existente).

### Hallazgo 4 (bloqueante) — consultant archivaba ejercicios por REST
Tres capas cerradas: UI ya ocultaba el botón (conservado);
`archiveTraceabilityExerciseAction` ahora comprueba `roleCode` (“Solo administrador o
calidad pueden archivar ejercicios.”); y el guard 0107 exige el rol en
`completed→archived` (las mutaciones legítimas del borrador NO cambian: el control vive
en la transición, no en la policy). Pruebas: C1 (candado de la acción), C2 (UPDATE directo
→ rechazado), C3 (admin OK), C4 (quality OK).

### Hallazgo 5 — Validación de conteos
Con los snapshots autoritativos los conteos ya son derivados en servidor; además, en BD:
`traceability_exercises_counts_check` y `audit_dossiers_counts_check`
(`gaps_count >= 0 and warnings_count >= 0`). Pruebas: E1 (`gaps = -1` rechazado incluso
con el flag transaccional encendido) y E2 (`warnings = -20` rechazado).

### Hallazgo 6 — Base exacta: `nums` eliminada
El Production real PCR-02.5.2 (commit `e15cde4820cf3fccb276cf8c64ba75bc93a13a61`) no
contiene `const nums = …` en `tests/unit/pcr02-4-hardening.test.ts`; la línea venía del
ZIP previo al cleanup y fue eliminada de nuevo. `npm run lint` queda con el ÚNICO warning
histórico (`domainSrc` en `tests/evidences/textiles-evidences-hardening.test.ts`).
Ninguna otra línea del baseline fue tocada.

### Pruebas y validación
Ataques 1–40 anteriores conservados y re-ejecutados; S13/S14 reescritas con A1–A5, B1–B5,
C1–C4, D1–D4, E1–E2; arnés PostgreSQL 16 real (13 pasos) + concurrencia C1 (saldos) y C2
(expedientes: versiones/códigos consecutivos sin duplicados) en verde; typecheck, lint,
test:pcr03-1/2/3, test:pcr03, test:all y build desde árbol limpio, sin reutilizar logs.

---

## Revisión 03.1–03.3.3 — Evidence Integrity & Dossier Completeness Closure (2026-08-15)

### Hallazgo 1 (bloqueante) — La evidencia archivada seguía contando en el PCR
El motor `calculate_recycled_content` (0028) solo miraba `status`; una evidencia
aceptada y luego ARCHIVADA seguía habilitando masa reciclada en cálculos nuevos,
contradiciendo la semántica 03.1 (vigente = `valid` AND `archived_at IS NULL`).
**Cierre:** la función se REDEFINE en 0106 (0028 BYTE-INTACTA, verificada por SHA-256
en la suite) copiando la versión vigente y aplicando ÚNICAMENTE la vigencia: el SELECT
transporta `origin_archived_at`/`reclass_archived_at` y las reglas 4 y 5 exigen
`valid` + no archivada; denominador, numerador, balance de masa, elegibilidad,
clasificaciones, reclasificación, tolerancias, warnings, metodología activa, snapshot,
permisos, firma, `search_path` y grants quedan EXACTOS. La exclusión produce las mismas
advertencias que un soporte no válido. Los cálculos históricos no cambian.
Prueba S15 (motor REAL ejecutado en PG16): valid cuenta → archivada NO cuenta →
histórico intacto → desarchivada vuelve a contar (`ARCHIVED_EVIDENCE_CALCULATION = PASS`).

### Hallazgo 2 — El test que no detectó el caso
`pcr03-1` referenciaba un archivo inexistente (`0028_recycled_calculation.sql`) y
asumía que 0106 no podía mencionar el motor. Corregido: fija 0028 por SHA-256,
verifica la redefinición en 0106, la conservación de TODAS las reglas metodológicas,
que el único cambio es `archived_at` y que la prueba conductual S15 existe.

### Hallazgo 3 (bloqueante) — Matriz de evidencias incompleta
El builder autoritativo solo recolectaba lotes/órdenes/entradas/materiales/proveedores.
**Cierre:** destinos `product` (productos de TODOS los lotes de la cadena) y
`customer_requirement` (requisitos aplicables al lote/producto/orden) añadidos.
Pruebas F1/F2 (`PRODUCT_EVIDENCE_IN_EXERCISE` / `CUSTOMER_REQUIREMENT_EVIDENCE_IN_EXERCISE`).

### Hallazgo 4 — Soportes directos del material (legacy y motor PCR)
`materials.origin_support_evidence_id` / `reclassification_evidence_id` (los MISMOS
campos que usa el motor 0028) ahora entran al snapshot como `target_type='material'`
con `link_role` 'Soporte de origen del material' / 'Soporte de reclasificación del
material', acotados a la organización y a los materiales de la cadena, sin duplicar
cuando también existe el enlace explícito. Pruebas F3–F5
(`IMPLICIT_MATERIAL_SUPPORT_IN_EXERCISE = PASS`).

### Hallazgo 5 — Metadata completa de la evidencia
El contrato autoritativo transporta ahora `evidence_id`, `evidence_date`, `status`,
`medium`, `archived_at`, `reviewed_at`, `reviewed_by`, `reviewed_by_email`,
`review_comment`, `responsible`, `physical_reference`, `physical_location`,
`physical_custodian`, `has_digital_file`, `link_role`, destino, `review_label` y
`current`. Jamás signed URLs (F12). Pruebas F6–F8 y `EVIDENCE_METADATA_IN_DOSSIER = PASS`.

### Hallazgo 6 — UI de la matriz
`/audit-prep/exercises/[id]` y `/audit-prep/dossiers/[id]` muestran tipo, fecha,
revisión (revisor y fecha), medio, localización física, custodia y responsable, en
formato compacto/responsive; el archivo digital se sigue abriendo desde Evidencias
con URL temporal.

### Hallazgo 7 — Calidad / NC / reclamos
`quality_evidences` se deriva del snapshot completo, por lo que las evidencias
`quality_control` / `non_conformity` / `customer_claim` de producto, lote, orden o
requisito llegan al expediente (F9).

### Hallazgo 10 — Limpieza
Comentarios de verificación con firmas viejas actualizados en 0107/0108; la matriz
de pruebas ya no menciona “2 warnings” (la validación real tiene solo `domainSrc`).

---

## Revisión 03.1–03.3.4 — Archived Evidence Consistency Closure (2026-08-15)

### Regla canónica de vigencia (hallazgos 1–7 de la revisión)
`status='valid' AND archived_at IS NULL` es ahora la semántica CANÓNICA en todo
Trazaloop PCR (la semántica de `status` no cambia). Superficies alineadas en 0106
(0031/0032/0034/0104 byte-intactas; sus vistas se redefinen copiando la versión
vigente y cambiando SOLO la vigencia documental):
- **v_output_batch_readiness** (0032): `all_required_support_valid`,
  `any_support_missing`, `origin_all_valid`, `reclass_all_valid` y
  `any_support_pending` tratan la archivada como NO vigente; columnas/orden/tipos/
  reglas idénticos; `v_guided_flow_dashboard` sigue operando encima.
- **v_output_batch_evidence_matrix** (0031): `is_valid_for_defensibility` exige no
  archivada; `archived_at`/`reviewed_at`/`reviewed_by` añadidas AL FINAL. La tabla
  UI filtra "Válidas" por el booleano real y muestra
  "Aceptada internamente · Archivada".
- **v_implementation_dashboard** (0034): soporte de origen vigente,
  `valid_evidences_count` y `pending_evidences_count` excluyen archivadas.
- **v_implementation_next_actions** (versión VIGENTE de 0104, que preserva 0065 y
  la CTE de consumo interno): `sample_material_without_origin` trata la archivada
  como soporte no vigente; `sample_pending_evidence` no selecciona archivadas.
- **Catálogo**: `listMaterials`/`listMaterialsPage`/getter traen `archived_at`;
  los tipos añaden `origin/reclassification_evidence_archived_at`; `SupportBadge`
  distingue con TEXTO el "Soporte archivado · no vigente".
- **Guided flow**: `validEvidences` usa `is_valid_for_defensibility`; las
  archivadas siguen visibles como históricas pero no cuentan.
Prueba T1 transversal (S17, PostgreSQL real): vigente → archivada → desarchivada
consistente en motor + readiness + matriz + dashboard + next_actions
(`ARCHIVED_EVIDENCE_CROSS_SURFACE_CONSISTENCY = PASS`); históricos intactos.

### Materiales de composición (hallazgos 9–10)
El builder define el conjunto CANÓNICO `CHAIN_MATERIALS` = materiales de los lotes
de entrada de la genealogía UNION los de `batch_composition` de TODOS los lotes de
la cadena (los mismos que evalúa el motor), usado para targets, soportes
implícitos y cobertura documental, sin duplicados. El snapshot expone además
`calculation.components` del motor. Prueba S18: material solo-composición sin
`evidence_links` → su soporte aparece en `snapshot.evidences` Y en
`calculation.components`, con la brecha de trazabilidad señalada sin ocultar la
evidencia (`COMPOSITION_ONLY_MATERIAL_EVIDENCE = PASS`).

### Requisitos de cliente (hallazgo 11)
`v_requirements` usa los productos de TODOS los lotes de la cadena (misma lógica
que las evidencias): un requisito de un producto intermedio ya no puede aparecer
en evidencias sin aparecer en la sección de requisitos.

### Limpieza (hallazgo 14)
Comentario obsoleto de 0108 ("la app aporta el CONTENIDO…") corregido: el
contenido también es verdad-servidor desde 03.1–03.3.2.
