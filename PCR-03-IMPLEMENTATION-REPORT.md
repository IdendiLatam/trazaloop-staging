# PCR-03 · Implementation Report (bloque 03.1 → 03.3)

> **Rev. 03.1–03.3.1 (Security & Integrity Closure).** El paquete original
> fue NO-GO. Esta revisión corrige 0106–0108 EN SITIO (PCR-03 no estaba
> integrado; 0001–0105 byte-idénticas) y endurece la app: (a) el trigger de
> evidence_links soporta customer_requirement; (b) sellos de revisión
> infalsificables también sin transición y reapertura solo admin/quality;
> (c) organization_id inmutable en las 4 tablas nuevas; (d) ejercicios y
> expedientes IMPOSIBLES de fabricar vía REST — nacen draft / vía RPC con
> flag transaccional (patrón 0084), hash/sellos/código/versión de
> verdad-servidor y versionado atómico con advisory locks; (e) contrato
> LinkedEvidence explícito; (f) bidireccionalidad evidencia↔requisito con
> navegación ?focus=; (g) búsqueda de ejercicios server-side antes de
> paginar. Detalle y pruebas: PCR-03-REVIEW-FIXES.md.


Tres sub-sprints, un commit y un tag por cada uno, sobre la rama
`feature/pcr-03-evidence-governance-preaudit-dossier`:
`b6c4d30 feat(pcr): add evidence governance PCR-03.1` (tag pcr-03.1-ready) →
`49581b9 feat(pcr): add pre-audit traceability exercise PCR-03.2`
(tag pcr-03.2-ready) → `feat(pcr): add audit dossier PCR-03.3`
(tags pcr-03.3-ready y pcr-03-ready). Migraciones EXACTAS 0106/0107/0108,
sin transaction control (regla PCR-02.5.2), aplicadas en el arnés con
`psql --single-transaction`. 26 archivos nuevos + 19 modificados (12 de
ellos, suites cuyos candados de frontera declararon la reserva del bloque).

## PCR-03.1 · Gobernanza de evidencias (0106)
La evidencia pasa de «archivo asociado» a evidencia GOBERNADA, de forma
ADITIVA sobre 0019 (sin segunda infraestructura):
- **Revisión interna**: columnas reviewed_at/reviewed_by/review_comment +
  guarda `guard_evidence_review` (SECURITY DEFINER, search_path fijo,
  revokes): →valid/→rejected exigen admin/quality (42501); el rechazo exige
  motivo (23514, «El motivo de rechazo es obligatorio.»); los sellos los
  pone el SERVIDOR (`auth.uid()`/`now()`) — infalsificables (S12.1 intenta
  falsificarlos). `valid` conserva su semántica histórica: «Aceptada
  internamente». La guarda de 0019 permanece: se complementa, no se
  sustituye.
- **Archivado**: archived_at/archived_by ortogonales al estado (sin cirugía
  de enums en transacción); solo admin/quality; la evidencia archivada deja
  de contar como soporte vigente por defecto (`isEvidenceCurrent`) sin
  perder el histórico (filtro «Incluir archivadas»).
- **Medios**: medium digital/physical/hybrid + campos físicos
  (referencia obligatoria, ubicación, custodia, notas) + CHECK
  `physical ⇒ storage_path IS NULL` (jamás finge archivo). Alta física sin
  archivo; «Declarar soporte físico» sobre una digital la vuelve híbrida.
- **Tipologías**: `evidence_type` sigue siendo texto libre (histórico
  intacto); el dominio aporta 8 categorías etiquetadas (origen/proveedor,
  trazabilidad, control de calidad, no conformidad, reclamación, acuerdo de
  cliente, soporte de reciclado, otro) usadas en formularios y filtros.
- **Acuerdos/requisitos de cliente**: `customer_requirements` (código
  único por empresa, vigencia, activo) + `customer_requirement_links`
  (producto/lote producido/orden, FK compuesta, trigger de destino
  anti cross-tenant «El destino del vínculo no existe o no pertenece a tu
  empresa.») + ampliación del enum `evidence_target_type` con
  `customer_requirement` (bidireccional con evidence_links, sin uso del
  valor dentro de la propia transacción). Vínculos por CÓDIGO resueltos en
  servidor: sin selectores de universo completo.
- **UI**: filtros combinables (estado/tipo/medio/archivadas), revisión con
  ConfirmDialog y panel de rechazo con motivo (window.confirm proscrito),
  fila con medio/categoría/referencia física/quién-cuándo-motivo, página
  de requisitos con vínculos y evidencias asociadas.

## PCR-03.2 · Ejercicio de trazabilidad (0107)
- **Tabla `traceability_exercises`**: draft/completed/archived, resultado
  interno prudente (complete / complete_with_warnings / incomplete),
  snapshot jsonb (`pcr_traceability_exercise_v1`), source_hash (SHA-256 de
  JSON canónico con claves ordenadas), conteos, FK compuesta al lote
  (restrict). Inmutabilidad jsonb-minus (patrón 0104 §2e): completado =
  fotografía; solo la transición pura completed→archived; DELETE de
  finalizados vetado (borradores sí). RLS por membresía; delete solo
  admin/quality (y aun así, nunca finalizados).
- **Ensamblador PURO** (`lib/domain/traceability-exercise.ts`): recibe
  datos colectados y clasifica observaciones info/advertencia/brecha por
  área (identidad, cantidades, trazabilidad externa/interna, evidencias,
  cliente, calidad, PCR) con recomendación práctica. Reglas prudentes: la
  ausencia de dato OPCIONAL jamás es brecha; brechas = cantidades
  inválidas/sobreconsumo heredado, cadena sin consumos, material sin
  evidencia vigente. Resultado derivado: brechas→incomplete,
  advertencias→complete_with_warnings, si no→complete.
- **Colector** (`lib/db/traceability-exercise.ts`): REUTILIZA
  `collectGraphForOutput` (multinivel, ciclos, profundidad 10), las vistas
  de saldos 0105, `listEvidencesForTargets` (una consulta por tipo de
  destino), `listRequirementsForTargets` y `listCalculationsForBatch`
  (metodología intacta). Nada se recalcula ni se duplica; sin signed URLs.
- **Acción síncrona**: inserta borrador (started_by de la sesión;
  created_by sellado por trigger), colecta, ensambla, congela
  (draft→completed con hash) y redirige al detalle.
- **UI**: lista paginada con filtro por estado, selector ACOTADO de lote
  (búsqueda por código, máx. 20), detalle con las 13 secciones del §6.7
  renderizadas DESDE el snapshot (huella visible) y disclaimer literal.
  «Preparación para auditoría» como sección del hub de trazabilidad.

## PCR-03.3 · Expediente (0108)
- **Tabla `audit_dossiers`**: generated/archived, snapshot
  (`pcr_audit_dossier_v1`), código legible `EXP-PCR-AAAA-NNNN` único por
  empresa (secuencia en servidor con reintento ante colisión), versión
  única por (org, lote) — cada generación es una versión NUEVA; FK
  compuestas al lote y al ejercicio (restrict). Inmutabilidad jsonb-minus;
  **DELETE vetado siempre** (ni política RLS de delete ni excepciones): los
  expedientes se archivan.
- **Snapshot A–K** (§7.2): portada, resumen con conteos, genealogía,
  balances, cálculo PCR (solo visibilidad; el efecto de la evidencia sigue
  la metodología existente), matriz de evidencias SIN signed URLs (las
  digitales se abren desde Evidencias con enlace temporal; las físicas
  muestran su localización), cliente, calidad, ejercicio asociado (con
  duración y huella), brechas consolidadas (severidad+fuente+recomendación)
  y disclaimer literal del brief.
- **«Existen cambios posteriores»**: heurística honesta y barata —
  updated_at del lote o de su orden posterior a la generación, o un
  ejercicio completado más reciente. Solo avisa; el histórico no se toca.
- **Impresión**: vista limpia por navegador (PrintButton + `no-print`),
  formato A4 razonable. Sin PDF server-side ni librerías nuevas.

## Decisiones transversales
Lenguaje prudente en todo (Aceptada internamente / ejercicio interno /
expediente interno; jamás certificado/cumple/aprobado — candados de
lenguaje sobre los snapshots completos). organization_id SIEMPRE del
servidor; dos capas de permisos (acción + RLS/triggers); sin service_role;
snapshots sin URLs firmadas; candados de frontera de migraciones
extendidos declarando la reserva EXACTA del bloque (lista cerrada, 0109+
vetado). Base git local documentada en el diagnóstico (árbol byte-idéntico
al ZIP PCR-02.5.2 = commit e15cde4 del cliente).


> **Revisión 03.1–03.3.2 (Authoritative Snapshot & Role Closure)**: snapshots verdad-servidor (RPCs sin `p_snapshot`), roles de archivado en BD y CHECKs de conteos. Detalle en `PCR-03-REVIEW-FIXES.md`.
