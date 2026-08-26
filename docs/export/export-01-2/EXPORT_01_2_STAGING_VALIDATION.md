# EXPORT-01.2 · Validación en Staging

**Base:** `qchzkxbnbqeyuxinipln` (Staging QA) · **Producción: intacta.**

## Estado del esquema

**Ninguna migración.** Staging sigue en **0122**. Este sprint es renderizador,
registro, adaptadores y pruebas: no toca la base. Sin `db reset`, sin `cleanup`,
sin tocar cuentas permanentes.

## Cómo se validó

Build de producción contra la base de Staging, con sesiones reales montadas en
la cookie que usa la aplicación. Dos empresas efímeras:

- **A**, con los tres módulos y **un logo PNG real subido al bucket privado** por
  la misma ruta que usa la pantalla de Datos de empresa
  (`{organization_id}/logo/logo.png`, con la fila apuntando a él);
- **B**, solo con Quality y **sin logo** — y después, con un logo **declarado y
  corrupto**.

Una sola empresa no puede demostrar aislamiento de marca. Con dos, sí.

## Resultado

**23 comprobaciones, 0 fallos.**

| Bloque | Nº | Qué demuestra |
|---|---|---|
| 14 exportaciones de las cinco familias | 14 | Logo en **todas** las páginas, nombre de empresa y nombre documental exacto — «DATOS DE LA EMPRESA», «LISTA MAESTRA DE DOCUMENTOS», «MAESTRO DE DOCUMENTOS TEXTIL», «LISTADO DE EXPEDIENTES DE AUDITORÍA»… |
| 250 materiales | 1 | **10 páginas · logo 10/10 · 2 objetos de imagen · 118 KiB**, primera y última fila presentes |
| Empresa sin logo | 1 | PDF correcto, sin objeto de imagen, con el nombre como identidad y **sin aviso falso** |
| Logo declarado y corrupto | 1 | El PDF **lo dice**; no incrusta basura; no menciona bucket, storage ni la ruta |
| Marca desde la URL | 1 | `organization_id`, `companyName`, `organizationName`, `logoUrl` y `documentName` **ignorados**: sale la marca de la sesión y el nombre documental del registro |
| PDF de B | 1 | No lleva la marca de A |
| Ruta heredada de Lista Maestra | 1 | Encabezado corporativo en todas sus páginas |
| Limpieza | 2 | Logos retirados del bucket y empresas efímeras retiradas |
| Cuentas QA permanentes | 1 | Las tres siguen existiendo |

Las tres cuentas QA permanentes **no se leyeron, no se cambiaron y no se
recrearon**.

## La prueba que más importa

El logo del encabezado en un PDF real de Staging no es una afirmación de código:
se subió un PNG al bucket privado, se pidió el PDF de **Datos de la empresa** por
el endpoint con una sesión real, se guardó el archivo y se **rasterizó y miró**.
El logo aparece dibujado a la izquierda del nombre de la empresa, con
«DATOS DE LA EMPRESA» debajo.

## Rendimiento

El listado de 250 materiales produce **10 páginas** con el logo dibujado **10
veces** y **2 objetos de imagen** en el archivo: el color y su máscara de
transparencia. El logo se descarga y decodifica **una vez por documento**, se
registra una vez y cada página lo referencia (§46).

## Residuo

**Ninguno.** Las dos empresas efímeras, sus usuarios y sus logos se retiraron.
A diferencia de EXPORT-01.1, esta validación no crea decisiones formales,
diagnósticos completados ni versiones publicadas, así que ninguna regla de
inmutabilidad impide el borrado — y no hizo falta tocar ninguna.

## Despliegue Preview

| | |
|---|---|
| Target | `preview` — nunca `--prod`, sin promoción, sin alias de producción |
| Rama | `fix/export-01-2-universal-corporate-header` |
| Commit | `540436d` |
| Estado | READY |
| Variables | tres, **solo scope Preview y solo esta rama** |
| Destino | `vercel env pull` devuelve el host de **Staging**; **cero** referencias a Producción; los dos valores sensibles llegan como `[SENSITIVE]` |
| SSO | Sigue activo (302 sin sesión de Vercel). No se desactivó |
| Production Environment / Development | **Sin tocar** |

`STAGING_KEY_SOURCE=VERIFIED`

## Secretos

Ningún valor de clave se imprimió, se guardó en Git, se escribió en un documento
ni quedó en un archivo temporal persistente.
