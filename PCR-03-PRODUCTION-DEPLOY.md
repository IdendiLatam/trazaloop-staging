# PCR-03 · Production Deploy (guía — NO ejecutada en este bloque)

Estado esperado: Production con la app PCR-02.5.2 y las migraciones hasta
la **0105 aplicadas**. Este bloque entrega 0106/0107/0108 (aditivas, sin
transaction control, sin cambios de datos) y la app PCR-03. Nada se
desplegó ni se vinculó a ningún proyecto durante el sprint.

## 1 · Backup
Backup/branch de la base ANTES de tocar nada.

## 2 · Preflight
Las tres migraciones son ADITIVAS (columnas nuevas, tablas nuevas, un valor
de enum): no auditan ni transforman datos existentes, así que no abortan
por datos legacy. Verificación previa recomendada:
```sql
-- Sin objetos con los nombres nuevos (colisiones improbables):
select to_regclass('public.customer_requirements'),
       to_regclass('public.traceability_exercises'),
       to_regclass('public.audit_dossiers');
-- Enum de destinos ANTES (sin customer_requirement):
select unnest(enum_range(null::evidence_target_type));
```

## 3 · Aplicar 0106 → 0107 → 0108 — SIEMPRE por el runner de migraciones
Nunca por el SQL Editor (rompería el historial del CLI). Flujo:

1. `npx --yes supabase@2.114.0 link --project-ref <PRODUCTION>`
2. `npx --yes supabase@2.114.0 migration list --linked`
3. `npx --yes supabase@2.114.0 db push --linked --dry-run`
4. Verificar que las ÚNICAS pendientes son 0106, 0107 y 0108 (en ese
   orden). Cualquier otra cosa: detenerse e investigar.
5. `npx --yes supabase@2.114.0 db push --linked`
6. `npx --yes supabase@2.114.0 migration list --linked` → las tres figuran.
7. Segundo `db push --linked --dry-run` → «Remote database is up to date».
8. Validación post-migración (sección 4).
9. `npx --yes supabase@2.114.0 unlink`.

Notas: la 0106 contiene `alter type … add value if not exists` — el valor
nuevo no se usa dentro de la propia migración (restricción de PostgreSQL
respetada). Ninguna de las tres toma candados prolongados; aplicar
igualmente en ventana de baja actividad.

## 4 · Validar BD (smoke SQL)
```sql
-- Revisión gobernada:
update evidences set status = 'rejected' where id = '<una pending>';
--   → 'El motivo de rechazo es obligatorio.'
-- Física honesta:
insert into evidences (organization_id, name, medium, storage_path)
values ('<org>', 'x', 'physical', 'y');   -- → check_violation
-- Inmutabilidad del ejercicio (con un ejercicio completado de prueba):
update traceability_exercises set notes = 'x' where id = '<completado>';
--   → 'El ejercicio finalizado es una fotografía histórica…'
delete from audit_dossiers where id = '<cualquiera>';
--   → 'El expediente forma parte del historial…'
```

## 5 · Deploy app + QA manual
Staged de Vercel Production → QA: revisar/rechazar (motivo obligatorio) y
archivar evidencias por rol; registrar evidencia física y declarar soporte
físico; filtros de evidencias; crear un acuerdo de cliente y vincularlo por
código; ejecutar un ejercicio sobre un lote multinivel real y verificar las
13 secciones + resultado prudente; generar el expediente (v1), volver a
generar (v2), imprimir desde el navegador y archivar; confirmar el aviso de
«cambios posteriores» tras editar el lote → promote.

## Rev. 03.1–03.3.1 · objetos añadidos por las migraciones corregidas

Al aplicar 0106–0108 corregidas quedan además: redefinición ADITIVA de
`validate_evidence_link_org()` (el trigger `t_evidence_links_same_org` de
0020 no se recrea), triggers `t_*_org_immutable` (patrón 0024) en las cuatro
tablas nuevas, guards de INSERT/UPDATE de `traceability_exercises` y de
INSERT de `audit_dossiers` (flag transaccional, patrón 0084) y las RPC
`complete_traceability_exercise(uuid, jsonb)` y
`generate_audit_dossier(uuid, uuid, jsonb)` (SECURITY DEFINER, EXECUTE solo
`authenticated`; la segunda re-verifica rol admin/quality en BD). Ninguna
operación de despliegue adicional: mismas migraciones, mismo orden.

---

## Rev. 03.1–03.3.2 — objetos nuevos/cambiados (0107/0108 corregidas en sitio)

- 0107: `pcr_build_exercise_snapshot(uuid, uuid)` (interna, sin EXECUTE para clientes);
  `complete_traceability_exercise(uuid)` — firma NUEVA sin `p_snapshot`;
  guard de inmutabilidad exige admin/quality en `completed→archived`;
  `traceability_exercises_counts_check`.
- 0108: `generate_audit_dossier(uuid, uuid default null)` — firma NUEVA sin `p_snapshot`,
  exige ejercicio completado; guard exige admin/quality en `generated→archived`;
  `audit_dossiers_counts_check`.
- App: acciones sin ensamblado de snapshots; rol explícito al archivar ejercicios;
  UI de expedientes con el mensaje de ejercicio previo obligatorio.
- PCR-03 sigue SIN integrarse: no existen firmas viejas que migrar en Producción.
