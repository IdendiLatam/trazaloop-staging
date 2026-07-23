#!/usr/bin/env bash
# Trazaloop · T9F.3 · Ejecuta el smoke REAL en un PG local efímero (t9f3local).
# Orden: shims T9F.2 → resolve real de 0100 → shims extra T9F.3 → shims extra
# T9F.4 → 0101 → smoke T9F.3 → smoke T9F.4.
set -euo pipefail
cd "$(dirname "$0")"
su postgres -c "dropdb --if-exists t9f3local && createdb t9f3local"
for f in ../t9f2-local-sql-harness/shims.sql ../t9f2-local-sql-harness/resolve-from-0100.sql shims-extra.sql shims-extra-t9f4.sql ../../supabase/migrations/0101_t9f1_module_access_hardening.sql; do
  echo "── aplicando: $f"
  su postgres -c "psql -q -v ON_ERROR_STOP=1 -d t9f3local -f $(realpath "$f")"
done
echo "── smoke:"
su postgres -c "psql -v ON_ERROR_STOP=1 -d t9f3local -f $(realpath smoke.sql)"
echo "── smoke T9F.4:"
su postgres -c "psql -v ON_ERROR_STOP=1 -d t9f3local -f $(realpath smoke-t9f4.sql)"
