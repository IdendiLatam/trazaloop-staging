# PCR-03 · Rollback

## ROLLBACK APP
Re-promover el deployment anterior (PCR-02.5.2). Compatible con las
migraciones 0106–0108 aplicadas: son aditivas y ninguna ruta antigua las
necesita.

## ROLLBACK DB — por sub-sprint, en orden inverso
**ADVERTENCIA de datos**: a diferencia de los sprints previos, aquí SÍ hay
tablas nuevas con datos de la empresa (revisiones de evidencias,
requisitos, ejercicios, expedientes). El rollback los ELIMINA de forma
irreversible: exportarlos antes si existieran, y tratarlo como último
recurso.

```sql
-- 03.3 · expedientes
drop table if exists public.audit_dossiers;
drop function if exists public.audit_dossiers_immutability_guard();
drop function if exists public.audit_dossiers_protect_delete();

-- 03.2 · ejercicios
drop table if exists public.traceability_exercises;
drop function if exists public.traceability_exercises_immutability_guard();
drop function if exists public.traceability_exercises_protect_delete();

-- 03.1 · requisitos de cliente
drop table if exists public.customer_requirement_links;
drop table if exists public.customer_requirements;
drop function if exists public.validate_customer_requirement_link_target();

-- 03.1 · gobernanza de evidencias
drop trigger if exists t_evidences_review_guard on public.evidences;
drop function if exists public.guard_evidence_review();
alter table public.evidences
  drop constraint if exists evidences_physical_without_file,
  drop constraint if exists evidences_medium_check;
alter table public.evidences
  drop column if exists reviewed_at,
  drop column if exists reviewed_by,
  drop column if exists review_comment,
  drop column if exists archived_at,
  drop column if exists archived_by,
  drop column if exists medium,
  drop column if exists physical_reference,
  drop column if exists physical_location,
  drop column if exists physical_custodian,
  drop column if exists physical_notes;
```

Notas: el valor `customer_requirement` del enum `evidence_target_type` NO
se elimina (PostgreSQL no lo permite de forma segura); es inocuo sin la
tabla — los `evidence_links` que lo usaran deben eliminarse antes de tirar
`customer_requirements` (el `drop table … cascade` implícito de la FK no
aplica aquí: la FK vive en el link de requisitos, no en evidence_links, así
que: `delete from evidence_links where target_type = 'customer_requirement';`
primero). Las guardas de 0019 (validación de evidencias) permanecen
intactas: el sistema vuelve exactamente al comportamiento PCR-02.5.2.

## Reversión git (histórico local)
`git checkout pcr-02.5.2-ready` o el respaldo `backup/pre-pcr03-20260814`.
Los tags pcr-03.* permanecen para auditoría del trabajo.

## Rev. 03.1–03.3.1

El rollback de 0106 debe además restaurar `validate_evidence_link_org()` a
la versión de 0025 (sin `customer_requirement`) y retirar los triggers
`t_*_org_immutable` de las tablas de PCR-03. Los de 0107/0108 retiran sus
guards y RPC (`drop function public.complete_traceability_exercise(uuid,
jsonb)`, `drop function public.generate_audit_dossier(uuid, uuid, jsonb)`).
Como PCR-03 sigue sin integrarse, el rollback práctico continúa siendo no
aplicar el bloque.

---

## Rev. 03.1–03.3.2

El rollback de PCR-03 no cambia: las migraciones 0106–0108 siguen sin aplicarse en
Producción; revertir = no aplicar el paquete. Los objetos añadidos por la revisión
(`pcr_build_exercise_snapshot`, nuevas firmas de las RPC, CHECKs y reglas de rol en los
guards) viven DENTRO de 0107/0108 y caen con ellas.
