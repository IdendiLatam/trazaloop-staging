# Trazaloop · Backups y restauración

Estrategia mínima para la fase piloto (v0.5.x) con Supabase Cloud.

## Backups

- **Automáticos de Supabase**: los planes de pago incluyen backups diarios
  (Database → Backups). Verificar que el proyecto de producción está en un
  plan que los incluya y revisar allí la retención disponible.
- **Manual antes de cambios mayores** (nueva migración, corte de versión):

  ```bash
  npx supabase db dump --db-url "$SUPABASE_DB_URL" -f backup-$(date +%Y%m%d).sql
  ```

  Guardar el archivo cifrado y fuera del repositorio (jamás commitearlo: el
  dump contiene datos de clientes).
- **Storage**: los archivos del bucket `evidences` no entran en el dump de
  BD. Para respaldo de archivos, exportarlos con un script administrativo o
  la CLI de Supabase según el volumen; en piloto, el volumen es bajo y el
  backup del proyecto de Supabase los cubre.

## Restauración

**Regla:** nunca restaurar "encima" del proyecto productivo. Restaurar a un
proyecto NUEVO, validar, y solo entonces apuntar la app.

1. Crear un proyecto Supabase nuevo (misma región).
2. Restaurar: desde el panel (Database → Backups → Restore) o con el dump
   manual:

   ```bash
   psql "$NUEVA_SUPABASE_DB_URL" -f backup-YYYYMMDD.sql
   ```

3. Validar con `npm run verify:prod` apuntando al proyecto restaurado
   (`.env.local` temporal) y un recorrido de `docs/PILOT_QA_CHECKLIST.md`.
4. Actualizar las variables en Vercel (URL, anon key, service key) y
   redeploy.
5. Reconfigurar Auth (Site URL / Redirect URLs) en el proyecto restaurado.

## Prueba periódica

Una vez por mes durante el piloto: tomar un dump manual y restaurarlo en un
proyecto desechable para confirmar que el procedimiento funciona de punta a
punta. Un backup no probado no es un backup.
