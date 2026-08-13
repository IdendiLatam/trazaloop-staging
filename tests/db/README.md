# tests/db — Validación de la 0104 en PostgreSQL LOCAL (PCR-02.1)

Suite conductual que aplica las migraciones **reales** `0025` y `0104` (tal
como se envían, sin copias) sobre un PostgreSQL local desechable y ejecuta
**33 aserciones**: constraints (§35), trigger anti-autoconsumo sin oráculo
(§14/§34), protección de reasignación (§2b), RLS real por rol y empresa
(§33), completitud casos A–F + ciclo (§22) e implementación casos 1–4 (§11),
con dos demostraciones «rojo antes / verde después» (S5.D2 y S6.5).

## Ejecutar

```bash
# PostgreSQL 16 local (ejemplo con clúster desechable):
initdb -D ./pgdata
pg_ctl -D ./pgdata -o '-p 5433 -k /tmp' -l pg.log start

npm run test:pcr02-1-db          # PGHOST=/tmp PGPORT=5433 PGUSER=postgres por defecto
```

Variables: `PGHOST`, `PGPORT`, `PGUSER`. Crea y destruye la base
`trazaloop_pcr02_1`. Sin servidor local disponible termina con **exit 2**
(BLOCKED) y un mensaje claro. **No** forma parte de `test:all` (requiere
PostgreSQL) y **jamás** toca Supabase remoto ni usa credenciales.

## Archivos

- `harness-prelude.sql` — superficie mínima equivalente a Supabase
  (`auth.uid()`, roles `authenticated`/`anon`, funciones de la regla 0024,
  `is_org_member`/`has_org_role`, tablas base y vistas de implementación
  emuladas). NO es una migración del producto.
- `run-local-pg.sh` — runner: arnés → 0025 real → 0104 real → grants estilo
  Supabase → aserciones.
- `pcr02_1_assertions.sql` — las 33 aserciones (S1–S6), con fixtures propios.

## Alcance honesto

El arnés **emula** la superficie de Supabase; no reemplaza el QA contra un
proyecto Supabase real (auth/JWT reales, storage, service role, suites
`test:rls`/`test:smoke` del repositorio), que sigue BLOCKED y documentado en
`docs/PCR-02.1-TEST-MATRIX.md`.
