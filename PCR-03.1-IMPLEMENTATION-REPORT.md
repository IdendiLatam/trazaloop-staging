# PCR-03.1 · Implementation Report — Gobernanza de evidencias

Commit `b6c4d30 feat(pcr): add evidence governance PCR-03.1` · tag
`pcr-03.1-ready` · migración única **0106_pcr031_evidence_governance.sql**.

Entregado (detalle completo en PCR-03-IMPLEMENTATION-REPORT §03.1):
revisión interna con motivo obligatorio y sellos de servidor
infalsificables (guarda SECURITY DEFINER complementando la de 0019);
archivado gobernado ortogonal al estado; medios digital/físico/híbrido con
CHECK «physical sin storage_path» y referencia documental obligatoria;
8 tipologías aditivas sobre el `evidence_type` histórico; modelo mínimo de
acuerdos/requisitos de cliente (tabla + vínculos por código con trigger de
destino anti cross-tenant + RLS) y bidireccionalidad evidencia↔requisito
ampliando el enum `evidence_target_type` existente (sin tablas paralelas).
UI: filtros combinables, revisión con confirmación (sin window.confirm),
alta física, declaración de soporte físico y página de requisitos.

Validación del sub-sprint: `typecheck` 0 · `lint` 0 (solo 2 warnings
preexistentes) · `test:pcr03-1` 18/18 · arnés DB con S12.1–S12.4 en verde ·
`test:all` en verde tras declarar la reserva del bloque en los candados de
frontera. Deuda: ninguna conocida.

**Rev. 03.1–03.3.1:** `validate_evidence_link_org()` redefinida aditivamente
(customer_requirement); sellos de revisión preservados también SIN transición
(fail-closed, reapertura rejected→pending solo admin/quality con veredicto
limpiado); organization_id inmutable en requisitos y vínculos; contrato
LinkedEvidence con medium/archived_at/physical_reference explícitos;
bidireccionalidad evidencia↔requisito con etiqueta humana y ?focus=.
