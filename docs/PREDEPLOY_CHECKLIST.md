# Trazaloop · Checklist predeploy (staging)

Marca cada punto antes de desplegar. `npm run predeploy` cubre los siete
primeros de una vez; `test:smoke` y `test:rls` requieren Supabase configurado
(ver docs/STAGING_DEPLOYMENT.md).

```text
[ ] npm ci ejecutado
[ ] npm run typecheck pasa
[ ] npm run build pasa (termina completo, exit code 0)
[ ] npm run lint pasa
[ ] npm run test:diagnostic pasa
[ ] npm run test:compliance pasa
[ ] npm run test:csv pasa
[ ] npm run test:guided pasa
[ ] npm run test:smoke pasa contra staging
[ ] npm run test:rls pasa contra staging o local (obligatorio antes de producción real)
[ ] .env.local no está en Git
[ ] tsconfig.tsbuildinfo no está en Git
[ ] Supabase migrations aplicadas (0001 … 0032)
[ ] Bucket evidences existe y NO es público
[ ] Auth redirect URLs configuradas (Site URL + Additional Redirect URLs)
[ ] Vercel env vars configuradas (las 5 de .env.example) y redeploy hecho
[ ] Flujo manual probado (login → organización → catálogos → evidencias →
    trazabilidad → cálculo → soporte técnico → flujo guiado)
```

Notas:

- `predeploy` NO incluye `test:rls` a propósito (requiere Supabase con
  credenciales); documentado como obligatorio antes de producción real.
- `test:rls` crea usuarios y datos de prueba: solo staging o local.
