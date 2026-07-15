# Trazaloop · TrazaDocs (Sprint 9)

Esta guía explica cómo construir, diligenciar y versionar documentos
técnicos vivos dentro de Trazaloop con TrazaDocs.

## 1. Qué es TrazaDocs

TrazaDocs son **documentos vivos dentro de la plataforma**, editables por
secciones, con ayudas contextuales, versionamiento y estados — no una
biblioteca de Word/PDF descargables, ni una carpeta de plantillas
externas. Todo el contenido se diligencia, guarda y consulta **dentro**
de Trazaloop: nunca hace falta descargar un archivo para editarlo fuera de
la plataforma.

## 2. Diferencia entre documento sugerido y documento libre

- **Documento guiado (estructura sugerida)**: parte de una de las 11
  estructuras que ofrece Trazaloop (procedimientos, instructivos, el
  manual técnico), con secciones y tips ya definidos. Tú solo diligencias
  el contenido de tu empresa.
- **Documento libre**: lo creas tú, con el nombre que quieras, y armas tus
  propias secciones. Ejemplo: «Procedimiento interno de inspección visual
  de material recuperado».

Ninguno de los dos es un archivo — ambos son documentos vivos dentro de
Trazaloop.

## 3. Cómo crear un documento desde estructura sugerida

1. `/trazadocs` → **Nuevo documento**.
2. Elige una de las estructuras sugeridas (por ejemplo, «Procedimiento de
   trazabilidad de material reciclado»).
3. Trazaloop crea el documento con sus secciones sugeridas **vacías** —
   nunca con contenido de relleno.
4. Diligencia cada sección y guarda.

## 4. Cómo crear un documento libre

1. `/trazadocs` → **Nuevo documento** → sección **Documento libre**.
2. Escribe el nombre que quieras, un código interno opcional y una
   descripción opcional.
3. Una vez creado, agrega tus propias secciones desde el editor.

## 5. Cómo diligenciar secciones

Cada sección tiene un título y un campo de texto. Escribe el contenido y
«Guardar cambios» — se guarda el contenido de **todas** las secciones del
documento a la vez.

## 6. Cómo usar el botón "i"

Junto a cada sección de una estructura sugerida hay un botón **i**. Al
hacer clic, muestra un tip con ayuda para diligenciar esa sección
específica — por ejemplo, qué debe cubrir el «Alcance» o cómo describir la
«Trazabilidad de lote producido / lote final». Los documentos libres no
traen tips (sus secciones son tuyas, sin sugerencia previa).

## 7. Cómo guardar y versionar

Al crear un documento (desde estructura sugerida o libre), Trazaloop
guarda de inmediato **v1 — Borrador inicial**: la primera versión real,
no solo un número en la ficha del documento.

Desde ahí, cada vez que ocurre una acción importante — **«Guardar nueva
versión»** explícito (con una nota de cambio opcional, por ejemplo «Se
ajusta alcance del procedimiento.»), enviar a revisión, aprobar, o marcar
obsoleto — Trazaloop guarda una **versión nueva**: un snapshot completo
del documento en ese momento. Ninguna versión anterior se sobrescribe. El
historial completo está en `/trazadocs/[id]/versions`.

## 8. Qué significan los estados

| Estado | Significado |
|---|---|
| Borrador | Se puede editar libremente. |
| En revisión | Listo para que alguien lo revise. |
| Aprobado | **No se edita directamente** — ni siquiera un administrador. Para modificarlo, «Crear nueva versión en borrador» (solo admin/supervisor) abre una versión nueva en estado borrador sin perder la aprobada. |
| Obsoleto | No se edita directamente — un administrador debe reactivarlo primero, lo que también deja un snapshot de versión claro. |

## 9. Qué roles pueden aprobar

- **Administrador**: crea, edita, aprueba, marca obsoleto, reactiva.
- **Supervisor** (`quality`): crea, edita borradores, envía a revisión, y
  también puede **aprobar** — cumple un rol de revisión técnica.
- **Consultor** (`consultant`): crea, edita borradores, envía a revisión,
  ve versiones — **no aprueba ni marca obsoleto, y tampoco puede reabrir
  un documento ya aprobado** bajo ninguna forma.

## 10. Cómo imprimir o guardar como PDF desde el navegador

`/trazadocs/[id]/print` da una vista limpia e imprimible con el nombre de
la empresa, título, código, estado, versión, responsable, fecha y el
contenido de cada sección. El botón **«Imprimir / guardar como PDF»** usa
la impresión del propio navegador — Trazaloop no genera el PDF en el
servidor todavía.

## 11. Cómo el superadmin administra estructuras y tips

Desde `/platform/trazadocs` (solo superadministrador de plataforma):

- Ver, crear y editar estructuras sugeridas (nombre, descripción, tipo).
- Activar / desactivar una estructura — una estructura inactiva deja de
  ofrecerse para documentos **nuevos** (los ya creados con ella no se ven
  afectados).
- Ver, crear y editar las secciones de cada estructura, incluido su tip de
  ayuda.
- Marcar una sección como obligatoria o sugerida.
- Activar / desactivar una sección.

Los tips son globales: los administra solo el superadministrador de
plataforma, no cada empresa por separado.

## Seguridad multiempresa

- `organization_id` nunca viaja desde el cliente: todo documento se crea y
  edita siempre dentro de la empresa activa validada en servidor.
- Los cambios de estado (enviar a revisión, aprobar, marcar obsoleto,
  reactivar) pasan por una función segura (`change_trazadoc_document_status`)
  que guarda el snapshot de versión, el historial de estado y actualiza el
  documento de forma atómica — nunca por varias escrituras sueltas desde
  el cliente.
- Las estructuras sugeridas y sus tips son de solo lectura para las
  empresas: nunca se editan desde `/trazadocs`, solo desde
  `/platform/trazadocs`.

## Comandos relacionados

```bash
npm run test:trazadocs   # lógica pura de permisos, versionamiento y estados (sin BD)
npm run test:rls         # aislamiento multiempresa de TrazaDocs (Supabase local)
```
