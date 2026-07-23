# Reconciliación de tamaños desconocidos · T9F.3 (§23)

Herramienta PREPARADA (no ejecutada en el sprint) para resolver el estado
`storage_unknown_size_count > 0`: registros con ruta física y `size` NULL en
`evidences`, `textile_evidences` y `storage_orphan_candidates` (estados
distintos de `deleted`). Mientras existan desconocidos, la vista los reporta
y las cargas nuevas del módulo quedan BLOQUEADAS (fail-closed): esta
herramienta es el camino documentado para desbloquearlas.

Qué hace:
1. Localiza los registros con tamaño desconocido.
2. Consulta la metadata REAL del objeto en Storage (`storage.info`).
3. Actualiza `size_bytes` SOLO cuando el objeto existe y reporta tamaño.
4. Marca en el reporte los objetos inexistentes o sin metadata para decisión
   manual — JAMÁS inventa tamaños.

Uso (máquina autorizada, `.env.local` con service role de STAGING):

```bash
npx tsx scripts/t9f3-size-reconciliation/reconcile.ts          # DRY-RUN (por defecto)
npx tsx scripts/t9f3-size-reconciliation/reconcile.ts --apply  # aplica los confirmados
```

Reglas: server-only (service role); nunca desde Claude Web; nunca dentro de
una migración; nunca automático.
