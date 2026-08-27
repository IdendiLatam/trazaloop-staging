# QUALITY-12.1 · La migración 0133

`supabase/migrations/0133_quality_ai_copilot_completion.sql`

## Por qué existe, y por qué no se editó la 0132

La 0132 **está aplicada en Staging**. Editarla significaría que el archivo del
repositorio y lo que hay en la base dejan de coincidir, y que cualquier réplica
futura desde cero produce algo distinto de lo que está en producción. Por eso
la 0133 **solo añade** (§65).

La prueba `F1` de `test:quality121` comprueba que la 0132 no lleva ni una
palabra de este sprint. La `F2` comprueba que la 0133 va inmediatamente detrás
y que nadie coló nada por en medio.

## Qué trae

### 1 · El detalle del consumo

```sql
alter table quality_ai_runs
  add column if not exists cached_input_tokens integer,
  add column if not exists reasoning_tokens    integer,
  add column if not exists total_tokens        integer;
```

Un proveedor que razona y que reutiliza contexto en caché informa de dos
números más, y sin ellos la factura no cuadra con lo que la aplicación cree
haber gastado. **Null** cuando el proveedor no los informa; nunca cero.

`quality_ai_complete_run` pasa a admitirlos. La firma antigua **se retira** en
lugar de convivir: dos funciones con el mismo nombre y distinto número de
argumentos por defecto dejan la llamada ambigua, y una llamada ambigua en la
ruta de cierre significa consultas que se quedan colgadas en `running`. Prueba
`F6`.

`v_quality_ai_run_overview` se recrea con las tres columnas **al final** —donde
no rompen a nadie que ya la leyera— y `quality_ai_usage` las suma.

### 2 · Los temas de clientes

| Objeto | Qué es |
|---|---|
| `quality_ai_customer_themes` | el tema: periodo, etiqueta estable, tono, respaldo, estado, procedencia congelada |
| `quality_ai_customer_theme_evidence` | en qué referencias de la consulta se apoya |
| `v_quality_ai_customer_theme_series` | la serie, con el periodo anterior del mismo tema al lado |
| `quality_ai_record_customer_theme(...)` | lo escribe el servidor al cerrar una consulta de temas |
| `quality_ai_resolve_customer_theme(...)` | lo confirma o lo descarta una persona |

### 3 · Una clave que faltaba

```sql
alter table quality_ai_run_references
  add constraint quality_ai_run_references_org_id_uniq unique (organization_id, id);
```

La 0132 no la declaró porque nadie apuntaba a esas filas todavía. Sin ella no
se puede exigir por clave foránea que una evidencia y su referencia vivan en la
**misma empresa**, y esa es justamente la comprobación que aquí no puede
faltar.

## Permisos

* **RLS activada** en las dos tablas nuevas.
* `revoke all … from anon, authenticated` **antes** de conceder — Supabase
  concede `TRUNCATE`, `REFERENCES` y `TRIGGER` por omisión, y revocar primero
  es lo único que los quita.
* Se concede **solo `select`**. Se escriben por RPC, que es la que sabe qué
  está permitido. Pruebas `F3` y `F4`.
* La vista lleva **`security_invoker = true`**. Sin él se ejecutaría con los
  permisos de quien la creó y devolvería temas de **cualquier** empresa a quien
  supiera el identificador. La prueba `C8` de `test:quality121-rls` lo
  descubrió durante el desarrollo: la primera versión de la vista no lo tenía.
* Toda función definer fija `search_path = public`. Prueba `F5`.

## Réplica limpia

Verificada de cero: `supabase db reset --local` reconstruye hasta la 0104 y se
detiene en la 0105 —característica documentada del repositorio, `LOCK TABLE`
fuera de un bloque transaccional—; a partir de ahí se aplican 0105…0133 con
`psql --single-transaction`. Las 125 migraciones quedan aplicadas y las tres
suites de Copilot vuelven a pasar contra esa base recién construida.

## Vuelta atrás

La 0133 no cambia nada de lo anterior salvo la firma de `quality_ai_complete_run`.
Para deshacerla haría falta restaurar esa firma y eliminar los dos objetos
nuevos; la operativa está en `QUALITY_12_1_ROLLBACK.md`.
