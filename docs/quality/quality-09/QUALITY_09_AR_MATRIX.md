# QUALITY-09 · Matriz AR-01 … AR-20

Cada decisión, dónde vive en el código y cómo se demuestra.

| # | Decisión | Dónde vive | Cómo se demuestra | Estado |
|---|---|---|---|---|
| **AR-01** | El programa de auditorías es una entidad propia, distinta de la auditoría individual | `quality_audit_programs` · `PROGRAM_STATUSES` ≠ `AUDIT_STATUSES` | `test:quality09` A1–A3 · `-rls` A1 | **CUMPLE** |
| **AR-02** | El programa es dinámico: cambia, y cada cambio deja revisión con su foto | `quality_audit_program_revisions` · `quality_record_program_revision` · sin `update`/`delete` | `test:quality09` A6–A7 · `-rls` A3–A4 | **CUMPLE** |
| **AR-03** | Una auditoría puede existir fuera de programa, declarándose extraordinaria | `program_id` nullable · `nature = 'extraordinary'` | `test:quality09` A2 · `-rls` N2 | **CUMPLE** |
| **AR-04** | La priorización se informa con lo que ya se sabe; **no** programa nada sola | `quality_audit_priority_context` → `suggests_only:true`, `schedules_automatically:false` · `explainPriority` | `test:quality09` J1–J3 | **CUMPLE** |
| **AR-05** | El criterio documental resuelve la **revisión auditada**, no la de hoy | `quality_audit_criteria.document_revision_id` · dossier · `snapshot` del informe | `test:quality09` C2, H2 | **CUMPLE** |
| **AR-06** | El checklist es opcional y versionado; una versión publicada no se edita | `quality_audit_checklist_versions` · `quality_checklist_version_is_published` · `stable_key` | `test:quality09` C4–C6 · `-rls` E3, E6 | **CUMPLE** |
| **AR-07** | El expediente de preparación reúne lo que ya existe y no decide nada | `quality_audit_preparation_dossier` → `decides_nothing:true` | `test:quality09` F7 · `-rls` L5 | **CUMPLE** |
| **AR-08** | Reprogramar conserva la fecha original; cancelar no es borrar | `planned_*` vs `scheduled_*` · `quality_reschedule_audit` · `quality_cancel_audit` | `test:quality09` B1–B6 · `-rls` B1–B4, C1–C3 | **CUMPLE** |
| **AR-09** | La agenda es una intención, no un compromiso; la ejecución es otra capa | `quality_audit_agenda_items` vs `quality_audit_notes`/`_evidence` · `AGENDA_IS_AN_INTENTION` | `test:quality09` Q5 | **CUMPLE** |
| **AR-10** | **AUDITOR ≠ RESPONSABLE**; el auditor externo no necesita cuenta | `owner_position_id` vs `quality_audit_team_members.person_id` · único `lead` | `test:quality09` F1–F3 | **CUMPLE** |
| **AR-11** | La independencia se resuelve con los cargos de **la fecha**, y el sistema no la declara | `quality_audit_conflicts_on` · `quality_check_audit_independence` → `declares_independence:false` | `test:quality09` F4–F6 · `-rls` H1–H4 | **CUMPLE** |
| **AR-12** | La ejecución registra sin formalizar: nota ≠ evidencia | `quality_audit_notes` sin `evidence_id`/`finding_id` | `test:quality09` D3 · `-rls` F2 | **CUMPLE** |
| **AR-13** | **HALLAZGO ≠ NO CONFORMIDAD**, ni siquiera «posible no conformidad» | `proposed_classification` sin `'nonconformity'` · `classificationCreatesNonconformity` | `test:quality09` E1–E9 · `-rls` G1–G7 | **CUMPLE** |
| **AR-14** | Evaluar y escalar son actos explícitos de autoridad | `quality_evaluate_audit_finding` · `quality_open_case_from_audit_finding` | `test:quality09` E5–E6 · `-rls` G4–G5 | **CUMPLE** |
| **AR-15** | **EVIDENCIA ≠ HALLAZGO**; contestar un checklist no acusa | `quality_audit_finding_evidence` como puente · `checkResultCreatesFinding` = `false` | `test:quality09` C7, D1–D2 · `-rls` E5, F3 | **CUMPLE** |
| **AR-16** | El informe es una **foto** que no se edita; se corrige con otro | `snapshot jsonb` · `supersedes_id` · sin `update`/`delete` | `test:quality09` H1–H6 · `-rls` I2–I5 | **CUMPLE** |
| **AR-17** | La muestra dice de cuánto se revisó; no es cobertura | `population_size`/`sample_size` · `describeSample` | `test:quality09` D5 | **CUMPLE** |
| **AR-18** | La recurrencia es una señal, no un veredicto | `v_quality_audit_recurring_findings` · nada la escala | `test:quality09` L6 · pantallas | **CUMPLE** |
| **AR-19** | **Cerrar la auditoría ≠ cerrar las acciones**; exige decir qué queda | `quality_close_audit` con `p_followup_note` · `v_quality_audit_overview` | `test:quality09` G1–G4 · `-rls` J1–J3 | **CUMPLE** |
| **AR-20** | Trazaloop administra auditorías; **no concede certificación** | `TRAZALOOP_DOES_NOT_CERTIFY` en dominio, pantallas y los 12 papeles | `test:quality09` I1–I4 | **CUMPLE** |

**20 de 20 CUMPLE · 0 parciales · 0 incumplidas.**
