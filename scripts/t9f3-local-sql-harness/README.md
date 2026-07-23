# Arnés local SQL · T9F.3 (PostgreSQL efímero)

Valida EN LOCAL las superficies T9F.3 de la migración acumulada 0101:
triggers atómicos de límites (incluida la atomicidad multi-fila de las
importaciones), reservas de evidencias Textiles (begin/finalize/cancel/
vencimiento), tamaños desconocidos, ciclo pending_delete → deleted /
delete_failed, funciones server-only y concurrencia REAL con sesiones
psql simultáneas. **No** sustituye a la suite RLS preparada
(`tests/rls/t9f3-…`): aquí no hay RLS ni Storage físico — se valida la
BARRERA de límites y el ciclo contable, no el aislamiento.

- `shims-extra.sql` — objetos adicionales sobre los shims T9F.2
  (auth.users, plan_definitions con las cuotas reales, intents 0094+0097,
  columnas usadas por queue/finalize, privilegios para simular
  `set role authenticated`).
- `smoke.sql` — 32 comprobaciones OK/FAIL (baterías A triggers,
  B reservas, C finalize, D ciclo de borrado y server-only, E allowance).
- `concurrency.sh` — 3 carreras reales: último recurso permitido,
  begins simultáneos y finalizes simultáneos del mismo intent.
- `run.sh` — orquesta: shims T9F.2 → resolve real de 0100 → shims extra
  → 0101 → smoke (base `t9f3local` recreada en cada ejecución).

```bash
bash run.sh            # aplica todo y ejecuta el smoke (TODO EN VERDE)
bash concurrency.sh    # las tres carreras reales
```

Solo para validación local. Jamás aplicar contra staging/producción.
