# EXPORT-01 · Validación en Staging

**Base:** `qchzkxbnbqeyuxinipln` (Staging QA) · **Producción: intacta.**
Ni una migración, ni un despliegue, ni una variable, ni una fila.

## Estado del esquema

EXPORT-01 **no añadió ninguna migración**: exportar es lectura. Staging sigue
en **0122**, la de QUALITY-05, comprobado por presencia de `quality_risks`. No
hubo re-migración ni reset.

## Cómo se validó

Se levantó el build de producción **contra la base de Staging** y se pidieron
PDF por el endpoint único con una sesión real, autenticada por la API de
Supabase y montada en la cookie que usa la aplicación. Nada de `service_role`
para leer: la RLS decidió cada fila.

Se creó una empresa **efímera** con su usuario, se ejercitó, y se retiró al
terminar. Las tres cuentas QA permanentes no se tocaron: no se leyeron sus
contraseñas, no se recrearon, no se modificaron; solo se comprobó que siguen
existiendo.

## Resultado

**26 comprobaciones, 0 fallos.**

| Bloque | Qué se comprobó |
|---|---|
| 16 listados | `%PDF-`, `application/pdf`, `attachment`, `private, no-store`, y que el papel lleva el nombre de la empresa de la sesión |
| 1 ficha | el proceso creado aparece impreso con su nombre |
| Listado vacío | el PDF **dice** que está vacío en vez de salir en blanco |
| Clave inventada | 404 |
| Nombre de tabla como clave | 404 |
| Identificador inexistente | 404, indistinguible de uno ajeno |
| `organization_id` en la URL | **ignorado**: el PDF es de la empresa de la sesión |
| Sin sesión | no hay PDF |
| Teardown | la empresa y el usuario efímeros desaparecen de Staging |
| Cuentas QA | las tres siguen existiendo |

Los cuatro módulos respondieron: Quality, TrazaDocs (Lista Maestra), PCR y
Textiles.

## Un hallazgo real de esta validación

La primera ejecución **no pudo limpiar** lo que había creado: el cargo se negó a
borrarse porque era propietario de un proceso.

No es un defecto: es la regla de QUALITY-01 funcionando —la historia de una
responsabilidad se conserva—. Lo que estaba mal era el guion de limpieza, que
asumía un orden que el dominio no permite. Se corrigió el guion, no la regla.

Se dejó anotado porque la lección se repite: **cuando la base se resiste a un
borrado, la primera hipótesis debe ser que la base tiene razón.**

## Despliegue Preview

| | |
|---|---|
| Target | `preview` — nunca `--prod`, sin promoción, sin alias de producción |
| Rama | `feature/export-01-universal-pdf` |
| Commit | `f5ab6db` |
| Variables | tres, **solo scope Preview y solo esta rama**: `NEXT_PUBLIC_SUPABASE_URL` (no sensible), `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` y `SUPABASE_SECRET_KEY` (sensibles) |
| Destino | `vercel env pull` de esta rama devuelve el host de **Staging**; **ninguna** referencia al proyecto de Producción |
| Production Environment | **no se tocó** |

### Lo que NO pudo demostrarse, y se dice

El dominio del Preview está detrás de **Deployment Protection**: responde 302 a
cualquier petición sin sesión de Vercel. No se pudo, por tanto, ejecutar la
prueba de comportamiento *sobre la URL del Preview*.

Lo que sí está demostrado es lo que importa: que **el código de este commit,
contra la base de Staging, produce PDF correctos** (las 26 comprobaciones de
arriba), y que la configuración de esta rama apunta a Staging y a ninguna otra
parte.

### Un defecto de configuración que apareció por el camino

Las claves nuevas de Supabase (`sb_secret_…`) **no las acepta este proyecto**:
la API responde 401. La primera escritura de `SUPABASE_SECRET_KEY` en el Preview
de esta rama usó ese formato y habría dejado el despliegue sin cliente
administrativo funcional, sin ningún error visible hasta que algo lo necesitara.

Se detectó probando la clave contra la API antes de confiar en ella, se
sustituyó por la clave `service_role` vigente y se volvió a desplegar.

> **Queda advertido:** el Preview de `feature/quality-05-risks-opportunities`
> tiene, muy probablemente, la misma clave inválida en su `SUPABASE_SECRET_KEY`.
> No se corrigió porque la autorización de este sprint alcanza **solo a esta
> rama**. Conviene revisarlo antes de apoyarse en aquel Preview.

## Secretos

Ningún valor de clave se imprimió, se guardó en Git, se escribió en un documento
ni quedó en un archivo temporal persistente. Las claves se leyeron de la API de
Supabase en memoria y se enviaron a Vercel por entrada estándar.

`STAGING_KEY_SOURCE=VERIFIED`
