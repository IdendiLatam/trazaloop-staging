# Trazaloop · PCR-02.3 — Guía de despliegue (NO ejecutada)

Nada remoto fue tocado en este sprint. Esta guía REEMPLAZA a
`PCR-02.2-PRODUCTION-DEPLOY.md` (y anteriores): se despliega **una sola
migración (`0104`) y un solo release de app**, ya con el candado histórico.

## Orden recomendado

1. **Backup** completo de la base (imprescindible: la 0104 incluye un
   backfill que escribe en `production_orders`).
2. `supabase db push` (aplica solo `0104`; `0001–0103` intactas).
3. Deploy de la app PCR-02.3 en Vercel.
4. Humo (§5 de la 0104 + `PCR-02.3-TEST-MATRIX.md`): cerrar una orden de
   prueba → verificar `history_locked_at` asignado; reabrirla con «Reabrir
   orden» → aviso «Orden histórica reabierta» y **sin** botón Eliminar;
   intentar DELETE por API → «Esta orden ya forma parte del historial de
   trazabilidad y no puede eliminarse.»; una orden `draft` de prueba sin
   dependencias sigue siendo eliminable.

## Hot compatibility con v1.0.1 (§53) — ventana entre paso 2 y 3

* La columna nueva es **nullable y sin NOT NULL/default obligatorio**: los
  INSERT y UPDATE que emite la v1.0.1 viva (que no conocen la columna)
  siguen funcionando sin cambios.
* Si la app vieja **cierra o cancela** una orden durante la ventana, el
  trigger `t_production_orders_history_lock` activa el candado de todos
  modos (probado por SQL directa en S9.1 — la vía que usa PostgREST).
* Si la app vieja **reabre y borra** durante la ventana: el DELETE ya queda
  vetado por el trigger §2d (el candado se activó al cerrar). La app vieja
  mostrará su error genérico — cosmético y transitorio, la historia queda
  protegida desde el instante de la migración.
* El resto de la ventana es idéntico al análisis PCR-02/02.1/02.2 (tablas y
  columnas nuevas invisibles para v1.0.1; triggers compatibles).

## Backfill aplicado por la 0104 (§54)

Exactamente **dos categorías**, ambas con evidencia inequívoca:

1. Órdenes HOY en `closed/cancelled` sin candado → `history_locked_at =
   now()`. Semántica documentada en el `comment` de la columna: activación
   técnica del candado en la migración, **no** fecha real de cierre (no se
   falsifica historia con `updated_at`).
2. Órdenes hoy abiertas cuyo paso por `closed/cancelled` consta en
   `audit_log.diff` (auditoría instalada desde la propia 0025 → cobertura
   desde el nacimiento de la tabla). Sin evidencia, **no se marca nada**.

Ninguna otra fila cambia; las órdenes nunca finalizadas siguen con
`history_locked_at = NULL` y conservan su comportamiento de eliminación.

## Verificación post-deploy adicional

```sql
select count(*) filter (where status in ('closed','cancelled') and history_locked_at is null) as finalizadas_sin_candado
  from production_orders;  -- debe ser 0
```
