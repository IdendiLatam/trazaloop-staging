# EXPORT-01 · Reversión

## Por qué es barato revertir

EXPORT-01 **no toca el esquema**. No hay migración 0123, no hay tabla nueva, no
hay columna nueva, no hay política RLS nueva. Exportar es leer (EX-24).

Esa decisión no fue de comodidad: fue la consecuencia de §78, que pedía crear
una migración solo si hacía falta de verdad. Y no hacía falta. El efecto
secundario es que revertir este sprint es revertir **código**, nunca datos.

## Qué se revierte

| Nivel | Acción | Consecuencia |
|---|---|---|
| Rama completa | `git revert` del merge, o no fusionar | La plataforma vuelve al estado anterior. Los dos PDF documentales siguen funcionando: son los mismos artefactos |
| Una exportación | Quitar su entrada de `lib/export/registry.ts` | Su clave pasa a responder 404, igual que una inventada. El botón que la ofrecía falla la prueba H1, que es exactamente lo que debe pasar: obliga a retirarlo también |
| Un botón | Quitar el `ExportPdfButton` | La ruta sigue existiendo para quien tenga el enlace; la prueba H1 falla y avisa |
| Endpoint completo | Borrar `app/(app)/(shell)/export/[key]/route.ts` | Toda exportación deja de existir. Nada más se rompe |

## Lo único que hay que mirar dos veces

Dos enlaces cambiaron de destino:

- la ficha del documento controlado, y
- la Lista Maestra

Antes apuntaban a `/quality/documents/[id]/pdf` y
`/quality/documents/master/pdf`. Ahora pasan por `/export/quality.document.detail`
y `/export/quality.master-list.list`.

**Las rutas antiguas siguen existiendo y funcionando.** No se borraron. Una
reversión parcial que deje los enlaces viejos en su sitio no rompe nada: el PDF
que se descarga es el mismo, generado por el mismo escritor con los mismos
datos. Lo único que se pierde es la política común de nombres y cabeceras.

## Dependencia añadida

`sharp` pasó a estar **declarada** en `package.json`. Ya estaba instalada como
dependencia opcional de Next; lo que cambió es que ahora se declara en vez de
depender de que aparezca de rebote.

Si se revierte la declaración, la conversión de WebP se degrada sola: el
`import()` dinámico falla, se captura, y el PDF sale con el nombre de la empresa
como identidad. Ningún PDF deja de generarse por eso.

## Lo que NO hay que hacer

- **No hay migración que revertir.** Si alguien propone un `0123_revert_export`,
  la respuesta es que no hay nada que deshacer en la base.
- **No hay PDF que borrar.** Ninguno se guardó (EX-23): se generan bajo demanda
  y viven en el disco de quien los descargó.
- **No hay dato que restaurar.** El sprint no escribió una sola fila.
