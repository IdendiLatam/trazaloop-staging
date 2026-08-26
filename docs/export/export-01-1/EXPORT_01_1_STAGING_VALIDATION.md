# EXPORT-01.1 · Validación en Staging

**Base:** `qchzkxbnbqeyuxinipln` (Staging QA) · **Producción: intacta.**

## Estado del esquema

**Ninguna migración.** Staging sigue en **0122**. Se comprobó por presencia
(`quality_risks` responde) y por ausencia (no hay archivo > 0122 en
`supabase/migrations/`). Sin `db reset`, sin `cleanup`, sin tocar cuentas
permanentes.

Las seis consultas nuevas de la capa de datos leen tablas que 0121 y 0122 ya
habían creado. Ninguna necesitó una columna.

## Cómo se validó

Se levantó el build de producción **contra la base de Staging** y se pidieron
PDF por el endpoint único con sesiones reales, autenticadas por la API de
Supabase y montadas en la cookie que usa la aplicación. Nada de `service_role`
para leer: la RLS decidió cada fila.

Se crearon **dos** empresas efímeras, y esa es la parte que importa:

- **A** con los tres módulos en Plan Full.
- **B** con **solo Quality**.

Una sola empresa no puede demostrar aislamiento ni entitlement. Con dos, sí.

## Resultado

**43 comprobaciones, 0 fallos.**

| Bloque | Nº | Qué demuestra |
|---|---|---|
| 26 listados nuevos | 26 | `%PDF-`, `application/pdf`, `private, no-store`, y el nombre de **la empresa de la sesión** en el papel |
| Ficha de empresa | 1 | Imprime la empresa, lleva el aviso de estado actual y no contiene stripe, secret, token ni billing |
| Acción | 1 | Título, **las dos fechas objetivo**, la palabra «prorrogada» y **el caso del que viene** |
| Control | 1 | Imprime el control y explica que es una **barrera permanente**, no una acción |
| Revisión de proceso | 1 | Imprime UNA revisión con su vigencia |
| Diagnóstico sin datos | 1 | **404**, no 500 |
| Aislamiento entre empresas | 3 | `?organization_id=B` desde A devuelve **los datos de A**; B no puede la acción ni el control de A |
| Entitlement de módulo | 6 | B recibe **403** en cinco exportaciones de PCR y Textiles, y **200** en la suya |
| Volumen | 1 | 250 filas con «Ñ» → **9 páginas**, primera y última presentes |
| Limpieza | 1 | Las dos empresas efímeras desaparecen |
| Cuentas QA permanentes | 1 | Las tres siguen existiendo |

Las tres cuentas QA permanentes **no se leyeron, no se cambiaron y no se
recrearon**: solo se comprobó que siguen ahí.

## Rendimiento

**250 filas → 9 páginas · 116 KiB · 1.329 ms** extremo a extremo contra
Staging. El renderizador aislado hace 1.000 filas en 15 ms: ese tiempo es el
viaje a la base, no el dibujo.

## El defecto que solo aparece contra una base real

La primera ejecución devolvió **404** al pedir el PDF de una acción, y **200 con
la tabla vacía** al pedir el listado de acciones.

La causa era una clave foránea **compuesta** —`(organization_id,
owner_position_id)`, MDR-42— embebida por el nombre de la columna en vez de por
el de la restricción. PostgREST no la resuelve, devuelve el error en `error`, y
`(data ?? [])` lo convierte en una lista vacía.

**El defecto no era de este sprint.** `listCaseActions`, de QUALITY-04, ya usaba
esa forma, y `listCaseRequirements` la usaba para otra clave compuesta. En
producción eso significaba que **la tabla de acciones de un caso y sus
requisitos documentales salían vacíos** —en pantalla y en el PDF— como si el
caso no tuviera ninguna.

Nadie lo había reportado porque un fallo que se manifiesta como «no hay datos»
no se reporta.

Corregido en los cuatro sitios, con dos pruebas que impiden que vuelva: una fija
la forma correcta y otra prohíbe cualquier embebido por columna en `lib/db/` que
no esté en una lista blanca verificada.

## Tres veces que la base tuvo razón

El guion de validación falló al sembrar y al limpiar, y las tres veces el
equivocado era el guion:

1. Un **control vigente no se borra** (RO-23) — hay que devolverlo a borrador.
2. Un **caso con historia no se borra** (AC-13) — igual.
3. Una **referencia** solo admite `origin`, `evidence` o `related`.

Se corrigió el guion, no las reglas.

## Despliegue Preview

Ver el informe final. Target `preview`, rama
`feature/export-01-1-coverage-completion`, variables **solo** en scope Preview y
**solo** para esta rama, apuntando a Staging. Production Environment y
Development Environment sin tocar.

## Secretos

Ningún valor de clave se imprimió, se guardó en Git, se escribió en un documento
ni quedó en un archivo temporal persistente.

`STAGING_KEY_SOURCE=VERIFIED`
