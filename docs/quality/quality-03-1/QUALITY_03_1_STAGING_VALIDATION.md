# QUALITY-03.1 · Validación en Staging

**Destino:** `qchzkxbnbqeyuxinipln` — `trazaloop-staging-qa`
**Rama:** `fix/quality-03-1-temporal-lifecycle-pdf`
**Fecha:** 2026-08-23
**Production:** **intacta** — ver §5

## 1. Migración

Staging estaba en **0118** y quedó en **0119**. Append-only, sin
`migration repair`, sin editar ninguna migración histórica.

```
$ npx supabase db push --project-ref qchzkxbnbqeyuxinipln --dry-run
Would push these migrations:
 • 0119_quality_temporal_eligibility_and_lifecycle.sql

$ npx supabase db push --project-ref qchzkxbnbqeyuxinipln
Applying migration 0119_quality_temporal_eligibility_and_lifecycle.sql...

$ npx supabase migration list --project-ref qchzkxbnbqeyuxinipln
  local=0117  remote=0117
  local=0118  remote=0118
  local=0119  remote=0119
```

## 2. Suites contra Staging

```
· entorno: qchzkxbnbqeyuxinipln

test:quality031            EXIT=0  →  33 correctas, 0 fallidas
test:quality031-rls        EXIT=0  →  30 correctas, 0 fallidas
test:quality03-rls         EXIT=0  →  52 correctas, 0 fallidas
test:quality02-rls         EXIT=0  →  58 correctas, 0 fallidas
test:quality012-rls        EXIT=0  →  30 ✔, 0 ✘
test:quality011-rls        EXIT=0  →  37 en verde, 0 en rojo
test:quality01-rls         EXIT=0  →  51 en verde, 0 en rojo
test:module-access-isolation EXIT=0 → 17 correctas, 0 fallidas

test:quality03-ui          EXIT=0  →  17 correctas, 0 fallidas
test:quality02-ui          EXIT=0  →  26 correctas, 0 fallidas
test:quality012-ui         EXIT=0  →  16 en verde, 0 en rojo
test:quality011-ui         EXIT=0  →  16 en verde, 0 en rojo
test:quality01-ui          EXIT=0  →  15 en verde, 0 en rojo
```

**258** comprobaciones de base real y **90** pasos de recorrido, todas con
código de salida 0.

Lo que esto demuestra en el entorno remoto y no solo en local:

- un indicador vigente desde este mes **no exige el mes anterior**, y el
  barrido tampoco le crea tarea, alerta ni hecho en la bitácora;
- borrar un indicador con mediciones **falla en la base**, incluso para el
  administrador de la empresa;
- el código de un borrador eliminado **no vuelve a estar disponible**;
- el aislamiento se sostiene: una empresa ajena no averigua ni siquiera los
  contadores de otra.

**Recordatorio:** `NEXT_PUBLIC_*` se **inlinea en el build**. El recorrido se
corrió sobre un build recompilado con el entorno de Staging, y el `.env.local`
original se restauró después, verificado idéntico.

## 3. Preview

**Enlace canónico** — el alias de rama:

```
https://trazaloop-production-git-fix-qua-55ea25-idendi-latam-s-projects.vercel.app
```

`target: preview`, estado **Ready**, confirmado por rama:

```
$ npx vercel ls --meta githubCommitRef=fix/quality-03-1-temporal-lifecycle-pdf
  https://trazaloop-production-9e7dmc9no-…  ● Ready  Preview
```

Responde **302** tras el SSO de Vercel: la limitación **G-2** documentada desde
QUALITY-01.1, no desactivada porque es una opción de proyecto compartida con
Production.

No se creó ni se modificó ninguna variable de entorno.

## 4. Aceptación en navegador (local)

Con una empresa **Quality-only** —PCR y Textiles deshabilitados— y logo cargado
en Datos de empresa:

| Paso | Resultado |
|---|---|
| Login → selector | Quality primero, «Entrar →» visible (el hotfix de acceso sigue en pie) |
| Crear indicador mensual, «Rige desde» 01/08/2026 | creado |
| Ficha del indicador | **«Próxima medición: al cerrar 2026-08, el 31/08/2026»** — julio no aparece por ningún lado |
| Panel de ciclo de vida, recién creado | «Podrás eliminar este indicador mientras no haya producido resultados…» + «Eliminar indicador» |
| Registrar la medición de agosto | registrada |
| Volver al panel | **«Este indicador ya no puede eliminarse… Tiene 1 medición registrada. Retirarlo conservando su histórico.»** |
| Documento en borrador | «…puede eliminarse por completo» |
| Enviar a revisión, volver | **«Este documento no se elimina. Este documento ya salió del borrador (en revisión)… Tiene 1 decisión de revisión o aprobación. Retirarlo conservando su trazabilidad.»** + «Retirar documento» |
| Descargar PDF del documento | archivo real con el logo, renderizado y verificado |
| Descargar PDF de la Lista Maestra | mismo logo, identidad coherente |
| Quitar el logo y volver a descargar | ambos PDF siguen saliendo, con el nombre de la empresa y cero imágenes |

En ningún momento se escribió una URL interna para saltarse la interfaz, salvo
la navegación entre secciones ya visitadas.

## 5. Production

**Intacta.** Sin migración, sin despliegue, sin variables, sin datos, sin
seeds, sin activación.

Comprobación de solo lectura, por HTTP, sin CLI y sin conexión a la base:

```
trazadoc_document_codes  → PGRST205   no existe (la tabla nueva de 0119)
quality_objectives       → PGRST205   no existe
quality_measurements     → PGRST205   no existe
work_events              → PGRST205   no existe

trazadoc_documents       → HTTP 200   (control: una tabla que sí existe)
```

El control importa: sin él, cuatro errores no probarían nada.

## 6. Repositorio desvinculado

```
$ npx supabase status
"linked_project": null

$ npx supabase db push --dry-run
{"code":"LegacyProjectNotLinkedError","message":"Cannot find project ref…"}
```

> **Tercera vez.** `supabase/.temp/linked-project.json` volvió a aparecer al
> consultar la API de gestión —esta vez apuntando a Staging, en QUALITY-03.1
> apuntó a Production—. Retirado. Conviene revisarlo al cierre de cada sprint:
> el CLI lo reescribe solo.
