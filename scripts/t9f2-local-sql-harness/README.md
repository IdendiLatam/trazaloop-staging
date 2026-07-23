# Arnés LOCAL de validación SQL · T9F.2

Valida la migración `0101_t9f1_module_access_hardening.sql` en un PostgreSQL
**local efímero** (§33 del plan T9F.2), sin conexión alguna a staging ni
producción y sin datos remotos.

- `shims.sql` — objetos mínimos con las columnas EXACTAS del esquema real
  (0004/0050/0051/0057/0075/0082/0100) + roles de Supabase + `auth.uid()`
  simulada por GUC. NO es una migración.
- `resolve-from-0100.sql` — la definición REAL de
  `resolve_organization_module_access` extraída de 0100 (sin editar).
- `smoke.sql` — expectativas concretas: idempotencia (changed=false sin
  UPDATE ni auditoría), rechazo de módulo/estado arbitrarios y de
  no-superadmin, deduplicación física por (bucket, ruta) con versiones y
  huérfanos (41 MB exactos en el fixture), conflictos de tamaño (máximo +
  bandera), aislamiento de la vista, allowance (límites Demo, incrementos,
  deshabilitado verificado, ilimitado, no-miembro).
- `concurrency.sh` — dos sesiones psql SIMULTÁNEAS: primera asignación sin
  fila → 1 fila, 1 transición auditada, un changed=true y un changed=false,
  cero unique_violation; objetivos distintos → serializados (2 transiciones).

Uso (requiere PostgreSQL local):
```bash
createdb t9f2local
# T9F.3 consolidó 0101: se necesitan también los shims extra del arnés T9F.3
# (../t9f3-local-sql-harness/shims-extra.sql) ANTES de aplicar la migración.
psql -v ON_ERROR_STOP=1 -d t9f2local \
  -f shims.sql -f resolve-from-0100.sql \
  -f ../../supabase/migrations/0101_t9f1_module_access_hardening.sql \
  -f smoke.sql
bash concurrency.sh
```
Esto NO sustituye la suite RLS contra staging (`npm run test:t9f2-rls`), que
sigue siendo obligatoria DESPUÉS de aplicar 0101.
