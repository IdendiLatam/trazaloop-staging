# PCR-03 · Diagnóstico previo (bloque 03.1 → 03.3)

Base: tag `pcr-02.5.2-ready`. Nota de entorno: el `.git` del repositorio del
cliente no viaja en los paquetes; el trabajo se ancló en un repositorio git
local cuyo commit base (20b2508) contiene un árbol **verificado byte a byte
idéntico** al ZIP entregado de PCR-02.5.2 (SHA-256
`0a1c08ca6c642948b2ab294a491f022546aa1cf78957397728a10e2b2f042470`), que a su
vez corresponde al commit e15cde4 del cliente. Rama de trabajo
`feature/pcr-03-evidence-governance-preaudit-dossier`; respaldo
`backup/pre-pcr03-20260814`.

## Qué existía (reconocimiento §1, verificado en código)
- **Evidencias (0019)**: tabla `evidences` con enum `evidence_status`
  (`pending / valid / rejected / expired`) — `valid` YA es la aceptación
  interna (guarda `guard_evidence_validation`, solo admin/quality) y NO se
  renombra; `evidence_type` es texto libre; `storage_path` nullable;
  `evidence_links` con enum `evidence_target_type` (10 destinos), unicidad y
  FK compuesta; RLS por membresía; subida por intents verificados (0087+),
  jamás service_role. Faltaban: revisión con motivo/sellos, archivado,
  medio físico y tipologías de calidad/cliente.
- **Genealogía (PCR-02)**: `lib/domain/genealogy.ts` puro
  (`traceBackward`, ciclos con visited-set, `GENEALOGY_MAX_DEPTH = 10`) +
  colector `collectGraphForOutput` acotado. Reutilizados tal cual.
- **Inventario (PCR-02.5)**: vistas `v_input_batch_inventory` /
  `v_output_batch_inventory` con saldos derivados y guardas de
  sobreconsumo. Fuente de los balances del ejercicio.
- **Cálculo PCR (0028)**: `calculate_recycled_content` intocable; lectura
  vía `listCalculationsForBatch`. Solo visibilidad.
- **Snapshots**: patrón de pasaportes Textiles (schema_version +
  source_hash + inmutabilidad) replicado con hash SHA-256 canónico propio.
- **Inmutabilidad**: patrón jsonb-minus de 0104 §2e (reopen_only)
  replicado para ejercicio y expediente.
- **Roles**: admin / quality / consultant / viewer (`has_org_role`).
  Auditoría `audit_row_change`, `force_created_by`, `set_updated_at`.
- **Impresión**: `PrintButton` (`window.print()`) + clase `no-print` en
  `globals.css`. Sin PDF server-side; se mantiene.
- **Navegación**: sin sidebar central; hubs (dashboard / trazabilidad).
  «Preparación para auditoría» se integró como sección del hub de
  trazabilidad (§8): sin módulo comercial nuevo.

## Brechas cerradas por el bloque
03.1: la evidencia era «archivo asociado» sin revisión trazable, sin motivo
de rechazo, sin soporte físico honesto, sin tipologías de calidad/cliente y
sin modelo de acuerdos de cliente. 03.2: no existía forma de simular «el
auditor elige un lote» con resultado congelado. 03.3: no existía expediente
consolidado, versionado e imprimible por lote.

## Rev. 03.1–03.3.1 · diagnóstico de la revisión de seguridad

La revisión adversarial externa detectó que la primera entrega protegía el
flujo feliz pero no el acceso REST directo: snapshots e informes históricos
eran FABRICABLES por cualquier miembro autenticado, los sellos de revisión
solo se defendían durante la transición y el enum ampliado no bastaba sin
redefinir el trigger de enlaces. El cierre traslada TODA la verdad histórica
(estados, sellos, hashes, códigos y versiones) al servidor PostgreSQL con
los patrones ya existentes en la casa (flag transaccional 0084, inmutabilidad
0024) y demuestra cada ataque en el arnés. Detalle: PCR-03-REVIEW-FIXES.md.
