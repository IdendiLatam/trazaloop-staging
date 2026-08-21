# QUALITY-02 · Despliegue en Staging

**Destino:** `qchzkxbnbqeyuxinipln` — `trazaloop-staging-qa`
**Rama:** `feature/quality-02-document-control`
**Fecha:** 2026-08-21
**Production:** **intacta** — ver §6

---

## 1. Destinos

| Proyecto | Ref | Papel en este sprint |
|---|---|---|
| `trazaloop-staging-qa` | `qchzkxbnbqeyuxinipln` | **Único destino de escritura** |
| `trazaloop-production` | `mvmpadeixomwkpxbnhky` | Fuera de alcance. No se tocó |
| `trazaloop-staging` | `dtrxxqmdweykzncfmahc` | No se usó |
| `extrusion-diagnostic-db` | `sadoqnynjwfrxcaupzkk` | Ajeno al proyecto |

El único `--project-ref` que aparece en todo el sprint es
`qchzkxbnbqeyuxinipln`.

---

## 2. Migración

```
$ npx supabase db push --project-ref qchzkxbnbqeyuxinipln --dry-run
Would push these migrations:
 • 0116_document_control_revisions_workflow_and_tasks.sql

$ npx supabase db push --project-ref qchzkxbnbqeyuxinipln
Applying migration 0116_document_control_revisions_workflow_and_tasks.sql...
{"upToDate":false,"dryRun":false,
 "migrations":["0116_document_control_revisions_workflow_and_tasks.sql"],
 "message":"Finished supabase db push."}
```

Sin `migration repair`. Sin editar ninguna migración histórica. Append-only:
Staging estaba en 0115 y quedó en 0116.

---

## 3. Comportamiento verificado contra Staging

### 3.1 · Base real, con la sesión de cada usuario

```
· entorno: qchzkxbnbqeyuxinipln

quality-02-document-control     →  58 correctas, 0 fallidas
quality-01-process-foundation   →  51 en verde, 0 en rojo
quality-01-1-acceptance         →  37 en verde, 0 en rojo
quality-01-2-acceptance         →  30 ✔, 0 ✘
```

Las cuatro corren bajo RLS. El cliente administrativo se usa solo para crear
cuentas y ajustar el plan comercial.

> Las tres suites de QUALITY-01.x muestran menos comprobaciones que en local
> porque **omiten** las que necesitan SQL directo cuando no se define
> `SUPABASE_DB_URL`, y lo anuncian. La suite de QUALITY-02 no usa SQL directo:
> sus 58 comprobaciones son las mismas en local y en Staging.

Lo que esto demuestra en el entorno remoto, y no solo en local:

- La revisión permanece en **1** durante todo el ciclo enviar → devolver →
  corregir → reenviar → aceptar → aprobar.
- Los once ataques directos por PostgREST (§H de la suite) fallan **en la base**.
- El aislamiento entre empresas se sostiene en revisiones, participantes,
  decisiones, tareas, alertas y Lista Maestra.
- **Los privilegios están bien.** Es la comprobación que 0115 existe para hacer:
  en un proyecto remoto de Supabase los privilegios por defecto conceden DML
  sobre cada tabla nueva, invisible en local. Los intentos H3, H4 y H5
  —insertar un participante, una decisión y una tarea a mano— fallan también
  aquí, que es lo que confirma que el bloque de `revoke` de 0116 §10 hizo su
  trabajo.

### 3.2 · Recorrido humano por HTTP contra Staging

```
26 correctas, 0 fallidas
```

Los 26 pasos —incluidas las descargas reales de los dos PDF y del CSV— contra
la base de Staging.

**Recordatorio que ya costó un intento en QUALITY-01.2:** `NEXT_PUBLIC_*` se
**inlinea en el build**. Un build hecho con el entorno local apunta a Supabase
local por mucho que se cambien las variables al arrancar. Hay que recompilar con
el entorno de Staging antes de correr el recorrido.

---

## 4. Preview

**Enlace canónico** — el alias de rama, que siempre apunta al último despliegue
de `feature/quality-02-document-control`:

```
https://trazaloop-production-git-feature-93345d-idendi-latam-s-projects.vercel.app
```

Es el que hay que usar. Vercel crea además una URL inmutable por despliegue
(`…-cm89vfi9c-…`, `…-7fxb1qwll-…`, `…-fb18rin60-…`), pero cambia con cada
commit —incluidos los que solo tocan este documento—, así que fijar una aquí no
podría ser cierto por mucho tiempo. El alias no tiene ese problema.

Estado **Ready**, `target: preview`, construido automáticamente por la
integración de Git al empujar la rama.

`QUALITY_MODULE_ENABLED` está definida en el entorno **Preview** (variable
sensible, valor no legible desde el CLI). No se creó ni se modificó ninguna
variable en este sprint.

Sigue tras el SSO de Vercel —responde 302 a una petición anónima—, que es la
limitación G-2 documentada desde QUALITY-01.1: no se desactivó porque es una
opción de proyecto compartida con Production.

---

## 5. Repositorio desvinculado

Al terminar:

```
$ npx supabase db push --dry-run
{"code":"LegacyProjectNotLinkedError","message":"Cannot find project ref. Have you run supabase link?"}
```

Un `db push` escrito por costumbre falla por falta de destino y obliga a un
`--project-ref` explícito. `supabase/.temp/linked-project.json` —un resto de una
versión anterior del CLI, que `supabase status` ya reportaba como
`linked_project: null`— se retiró, con copia fuera del repositorio.

---

## 6. Production

**Intacta.** Comprobable:

| | |
|---|---|
| Migraciones aplicadas | ninguna |
| Variables de entorno | sin tocar |
| Despliegues | ninguno (`target: preview` en el único despliegue del sprint) |
| Datos | sin leer y sin escribir |
| `QUALITY_MODULE_ENABLED` | no definida allí — Quality sigue invisible |

Las únicas operaciones sobre proyectos remotos fueron: `projects list`
(lectura), `projects api-keys` sobre Staging y sobre Production (lectura de la
API de gestión; no abre conexión a la base), `migration list --project-ref
qchzkxbnbqeyuxinipln` y `db push --project-ref qchzkxbnbqeyuxinipln`.

### 6.1 · Comprobación de solo lectura sobre Production

Se verificó por HTTP —sin CLI, sin conexión a la base y sin inicializar ningún
rol— que las tablas de 0116 **no existen** en Production:

```
trazadoc_document_revisions → PGRST205  Could not find the table …
trazadoc_document_decisions → PGRST205  Could not find the table …
work_tasks                  → PGRST205  Could not find the table …
work_alerts                 → PGRST205  Could not find the table …

trazadoc_documents          → HTTP 200   (control: una tabla que sí existe)
```

El control importa: sin él, cuatro respuestas de error no probarían nada —
podrían venir de una clave mal formada o de un proyecto caído—. Con él, queda
claro que la API responde bien y que lo que falta es exactamente 0116.

`QUALITY_MODULE_ENABLED` **no está definida** en el entorno Production de
Vercel: Quality sigue invisible allí.

---

## 7. Cómo repetirlo

```bash
# 1 · Verificar el destino ANTES de escribir
npx supabase projects list

# 2 · Qué se aplicaría (no escribe nada)
npx supabase db push --project-ref qchzkxbnbqeyuxinipln --dry-run

# 3 · Aplicar
npx supabase db push --project-ref qchzkxbnbqeyuxinipln

# 4 · Suites con base real (las credenciales NUNCA en el repositorio)
export NEXT_PUBLIC_SUPABASE_URL=https://qchzkxbnbqeyuxinipln.supabase.co
export NEXT_PUBLIC_SUPABASE_ANON_KEY=…
export SUPABASE_SERVICE_ROLE_KEY=…
export SUPABASE_DB_URL=""      # o el pooler de sesión, para las pruebas SQL
npm run test:quality02-rls

# 5 · Recorrido HTTP: recompilar con ESE entorno antes de correrlo
npm run build && npm run test:quality02-ui

# 6 · Desvincular
npx supabase unlink
```

### Reconstrucción local completa

`supabase db reset` se detiene en **0105**: esa migración toma un `LOCK TABLE` y
el runner del CLI ejecuta algunas sentencias fuera de un bloque transaccional.
**No es un problema de QUALITY-02** —lo documenta el propio encabezado de 0105 y
ya se registró en QUALITY-01.2—. La vía soportada en local es aplicar cada
archivo con `psql --single-transaction`:

```bash
npx supabase db reset --no-seed        # llega hasta 0104
for f in supabase/migrations/*.sql; do # el resto, uno a uno
  psql "$DB" -v ON_ERROR_STOP=1 --single-transaction -f "$f"
done
```

Con ese procedimiento se comprobó que **0001 → 0116 reconstruyen la base desde
cero**. Contra Staging, `db push` administra su propia transacción y no hay
ningún problema.
