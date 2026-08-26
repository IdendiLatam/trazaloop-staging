# EXPORT-01 · Arquitectura

## La cadena

```
petición  →  clave del registro (lista cerrada)
          →  empresa desde la SESIÓN
          →  entitlement del módulo
          →  rol
          →  adaptador de dominio (lee bajo RLS)
          →  Print Model
          →  renderizador común
          →  bytes + cabeceras
```

Cada eslabón hace una cosa y ninguno confía en el anterior.

## Las cinco piezas

| Pieza | Archivo | Qué hace |
|---|---|---|
| **Print Model** | `lib/export/print-model.ts` | Describe un documento sin saber de dominios. Puro y serializable |
| **Renderizador** | `lib/export/render.ts` | La ÚNICA función que dibuja un PDF de Trazaloop |
| **Registro** | `lib/export/registry.ts` | Lista cerrada de exportaciones. Añadir una entidad es añadir una entrada |
| **Endpoint** | `app/(app)/(shell)/export/[key]/route.ts` | Un solo punto de entrada, con todo el guard explícito |
| **Adaptadores** | `lib/export/adapters/*.ts` | Traducen un dominio al Print Model. `server-only` |

Más dos ayudas transversales: `filename.ts` (nombres y cabeceras) y
`branding.ts` (identidad de empresa).

## Por qué el Print Model existe

Sin él, cada pantalla acabaría con su propio PDF artesanal: catorce
encabezados, catorce formas de paginar una tabla, catorce sitios donde arreglar
el mismo defecto. Con él hay **un** renderizador y **N** descripciones.

Y una razón menos obvia y más importante: el modelo no sabe de React, de la
sesión ni de la base. Eso permite que una prueba construya un documento a mano
y compruebe el archivo resultante sin levantar nada — que es exactamente lo que
hacen las 12 comprobaciones de la sección E de la suite.

## El motor de PDF: se refactorizó, no se sustituyó (§56)

El escritor de QUALITY-02 ya resolvía lo difícil: páginas, ajuste de línea,
tablas con encabezado repetido, «Página N de M», imágenes JPEG y PNG con
transparencia, vertical y apaisado. Traer una dependencia madura habría
significado reescribir todo eso para ganar poco, y §57 prohíbe la vía del
navegador.

Lo que le faltaba era **color**: pintar solo en gris obliga a mirar de cerca
para distinguir cuatro bandas de una matriz. Se añadieron dos operaciones —
`rectRgb` y `strokeRect` — y con eso el motor cubre todo lo que EXPORT-01 pide.

**Decisión: opción A de §56.** El motor artesanal se conserva y se generaliza.
Ninguna dependencia nueva de PDF.

La única dependencia que sí se declaró es `sharp`, y no para dibujar: para
convertir logos WebP. Ver `EXPORT_01_SECURITY.md`.

## El registro es cerrado, y por qué importa

La alternativa evidente sería un endpoint que acepte «qué tabla» y «qué
columnas». Eso convierte el generador de PDF en un motor de consultas
arbitrarias: bastaría con pedir otra tabla, u otra empresa, para sacar lo que no
corresponde.

Aquí el navegador solo puede nombrar una CLAVE de la lista. Todo lo demás
—qué se consulta, con qué filtros, de qué empresa— lo decide el servidor.

## El escape documentado

`ExportResult` admite devolver un `buffer` ya renderizado en vez de un
`PrintDocument`. Lo usan **exactamente dos** exportaciones: el documento
controlado y la Lista Maestra.

Existían antes de EXPORT-01, llevan meses en uso y su contenido está comprobado
por 70 aserciones que abren el PDF real. §27 pide que su comportamiento validado
permanezca, así que se unifica el ACCESO —clave, endpoint, nombres, cabeceras—
sin tocar su composición. Comparten el mismo escritor y el mismo motor de
página, así que el «motor transversal» ya era el suyo.

Una prueba comprueba que ninguna definición nueva usa ese escape.

## Cómo crece

1. Adaptador en `lib/export/adapters/`.
2. Entrada en `registry.ts`.
3. `ExportPdfButton` donde el usuario lo espere.
4. Fila en la matriz de cobertura.

Los pasos 1 y 2 los vigila `test:export01`: una definición a medias no pasa.
