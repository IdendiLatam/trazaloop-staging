# QUALITY-12.3B3B · Partes interesadas · PDF Y EXPORTACIÓN

**Sin motor nuevo.** Tres definiciones en el registro cerrado de EXPORT-01, dibujadas
por el mismo renderizador que el resto de la plataforma: misma cabecera corporativa,
mismo pie, mismo sello de generación, mismo botón «Descargar PDF».

---

## 1 · Los tres documentos

| Clave | Qué es | Temporalidad |
|---|---|---|
| `quality.interested-party.list` | Reporte de partes interesadas | `current` |
| `quality.interested-party.detail` | Ficha de una parte interesada | `current` |
| `quality.interested-party.historical` | Partes interesadas al [fecha] | **`historical`** |

**Dos informes y no uno con un filtro**, porque una definición declara **una**
temporalidad. Un solo documento tendría que decir «esto es el presente» o «esto es una
reconstrucción», y cualquiera de las dos sería falsa la mitad del tiempo.

El histórico es `historical` **de verdad**: el dominio guarda la vigencia de cada
análisis, de cada requisito y de cada estrategia. Reconstruir un día no es estimar.

## 2 · Qué lleva el reporte

Empresa, fecha de generación, filtros aplicados, y un resumen con las seis cifras del
dominio contadas por la base. Después la tabla: parte, tipo, categoría, pertinencia,
prioridad **siempre con su metodología**, estrategias vigentes y estado de revisión.

La ficha añade la profundidad: el análisis vigente con su justificación, las
necesidades, las expectativas y los requisitos con su subtipo y su vigencia, los
procesos que los atienden con el tipo de relación y desde cuándo, las estrategias con
su alcance —general o multi-requisito, contado desde los vínculos—, su cargo
responsable y su método de seguimiento, las revisiones, la historia completa del
análisis con Vigente / Sucedido / Cerrado, lo relacionado por su nombre, y el contexto
de Voz del cliente y Proveedores **enlazado, no copiado**.

No es un volcado de tablas: cada sección responde a una pregunta que alguien hace.

## 3 · El documento de una fecha

Todo se lee **con** el corte: los análisis vigentes ese día, sus requisitos vigentes
ese día y sus estrategias vigentes ese día. Ni una consulta al presente. Lleva en la
primera página «Estado al [fecha]» y dice explícitamente que lo registrado después no
aparece y que ningún hueco se ha rellenado con datos de hoy.

Desde la ficha en modo histórico, el botón **cambia**: ofrece el documento de esa fecha
en vez del de hoy. Imprimir el estado actual bajo un encabezado del pasado sería firmar
algo falso, y hay una comprobación que falla si el botón se equivoca.

## 4 · Más de mil filas

El reporte y el histórico **paginan hasta agotar**. Un informe que corta en mil y no lo
dice es peor que uno que no se genera.

## 5 · Permisos

`permission: "member"` en los tres: quien puede leer puede descargar lo que ya ve. La
RLS vuelve a comprobarlo todo al leer; el endpoint es la primera puerta, no la única, y
la empresa sale de la **sesión**, nunca de la URL. Comprobado: otra empresa no descarga
la ficha aunque tenga el identificador, y sin sesión no hay PDF.

## 6 · Otros formatos

El motor universal de esta plataforma **solo produce PDF**. No se añadió CSV, JSON ni
XLSX solo para este dominio: sería un formato que ningún otro documento tiene y que
habría que mantener aparte. Queda documentado, no ampliado.

## 7 · Inventario

Tres entidades nuevas en `lib/export/inventory.ts`: la parte interesada con sus tres
ejes disponibles, y el requisito y la estrategia como **EMBEDDED** dentro de ella
—sueltos no se sabe de quién se está hablando—. Las matrices publicadas y los recuentos
se actualizaron: 170 claves, 212 entidades.
