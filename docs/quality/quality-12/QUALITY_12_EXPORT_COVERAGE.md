# QUALITY-12 · Cobertura documental

**`Q12_EXPORT_PENDING = 0`.**

## 1 · Las tres exportaciones

| Clave | Documento | Tipo | Temporalidad |
|---|---|---|---|
| `quality.ai-suggestion.detail` | Borrador generado con IA | ficha | **histórica** |
| `quality.ai-suggestion.list` | Listado de borradores generados con IA | listado | actual |
| `quality.ai-run.list` | Reporte de consultas al Copilot | listado | actual |

Las tres tienen botón en la pantalla del Copilot, pasan por el endpoint único y
exigen sesión, empresa activa y entitlement de módulo.

## 2 · El borrador se imprime COMO borrador (§127)

En la primera línea, antes del contenido:

> **ESTE DOCUMENTO ES UN BORRADOR GENERADO CON INTELIGENCIA ARTIFICIAL.** No es
> un registro aprobado, no es evidencia y no constituye ninguna decisión de la
> empresa.

Y en el distintivo de cabecera: `BORRADOR · IA`.

La razón es concreta: un papel con el logotipo de la empresa que no aclara de
dónde sale acaba archivado en una carpeta como si fuera un documento aprobado, y
ahí ya no hay forma de distinguirlo. Ponerlo al pie no basta.

El papel lleva además: el modelo, la plantilla de instrucciones **con su
versión**, quién lo pidió, cuándo, en qué estado quedó, quién lo revisó y —si lo
hubo— con qué registro acabó relacionado. Y la lista de fuentes.

## 3 · El reporte de consultas NO lleva contenido ajeno (§119)

`quality.ai-run.list` es un papel de **consumo**: cuándo, para qué, quién, con
qué modelo, con qué instrucciones, cuántas fuentes, cuánta evidencia, cuánto
tardó. **No lleva el texto de las preguntas ni de las respuestas**, y lo dice en
el propio documento.

## 4 · Lo que NO se exporta

**La consulta suelta.** No hay `quality.ai-run.detail`. Una consulta no es un
documento de la empresa: lo que se archiva es el borrador que salió de ella, si
salió alguno. La consulta se lee en el reporte.

**Las conversaciones.** Son hilos de trabajo privados de cada persona. Un
listado descargable de las conversaciones de la empresa sería exactamente lo que
§119 evita.

**Las valoraciones.** Un pulgar arriba o abajo es telemetría de producto.

## 5 · El inventario

| Entidad | Ficha | Listado | Histórico |
|---|---|---|---|
| Borrador del Copilot | ✔ | ✔ | ✔ (la ficha) |
| Consulta al Copilot | dentro del borrador | ✔ | sin histórico, con motivo |
| Fuente citada | dentro del borrador | dentro | dentro |
| Conversación | no documentable | no documentable | no documentable |
| Valoración de una respuesta | no documentable | no documentable | no documentable |

Tras QUALITY-12 el registro tiene **167 claves** y el inventario **209
entidades**, con cero pendientes. Las cuatro suites de EXPORT-01 siguen verdes.
