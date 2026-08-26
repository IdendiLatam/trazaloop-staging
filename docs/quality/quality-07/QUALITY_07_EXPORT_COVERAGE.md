# QUALITY-07 · Cobertura de exportación

> **§63, §64, §65, §66 · EXPORT-01 / 01.1 / 01.2**

## 1 · Trece claves, ninguna nueva puerta

Todas entran por el registro cerrado de `lib/export/registry.ts` y por el
endpoint único. El navegador solo puede nombrar una **clave**; todo lo demás lo
decide el servidor.

| Clave | Tipo | Temporalidad |
|---|---|---|
| `quality.supplier.detail` | ficha | current |
| `quality.supplier.list` | listado | current |
| `quality.approved-supplier.list` | listado | current |
| `quality.supplier-site.detail` | ficha | current |
| `quality.supplier-category.list` | listado | current |
| `quality.supplier-requirement.list` | listado | current |
| `quality.supplier-evaluation.detail` | ficha | **historical** |
| `quality.supplier-evaluation.list` | listado | current |
| `quality.supplier-criticality.detail` | ficha | **historical** |
| `quality.supplier-approval.detail` | ficha | **historical** |
| `quality.supplier-approval.historical` | histórico | **historical** |
| `quality.supplier-reevaluation.list` | listado | current |
| `quality.supplier-performance.detail` | ficha | current |

Inventario: **142 entidades · 123 claves · 0 PENDING**.

## 2 · La regla que atraviesa los trece

**Ninguno dice «proveedor aprobado» a secas.**

Un proveedor está aprobado PARA ALGO. Un papel que omitiera el alcance haría una
afirmación más amplia que la decisión que documenta — y es exactamente el
documento que alguien enseña en una auditoría creyendo que dice lo que no dice.

Y ninguno convierte una puntuación en una homologación. Los que imprimen
resultados llevan la nota:

> «El resultado de una evaluación NO aprueba a un proveedor. La decisión de
> aprobación es un acto aparte, de una persona, para un alcance concreto y con
> su fundamento.»

## 3 · Los nombres, sin colisión

PCR ya tenía «Proveedor» y Textiles «Proveedor textil». Las entidades nuevas
llevan apellido: **Proveedor evaluado**, **Sede de proveedor**, **Categoría de
proveedor**, **Requisito a proveedores**, **Evaluación de proveedor**,
**Criticidad de proveedor**, **Decisión de aprobación de proveedor**,
**Desempeño de proveedor**, **Reevaluación pendiente de proveedor**, **Empresa
externa**, **Contacto de proveedor**, **Alcance de suministro**, **Documento de
proveedor**, **Plantilla de evaluación de proveedor**.

Son la misma empresa vista desde otro módulo, pero no el mismo objeto
documental. Dos filas con el mismo nombre convierten el inventario en una
trampa, y la prueba L4 falla si aparece un nombre repetido.

La nomenclatura de la plataforma manda sobre la del dominio: la ASL de la norma
se llama en el registro **«Listado de proveedores aprobados»**, como todos los
listados, y conserva su nombre habitual en el cuerpo del papel, que es donde la
busca quien la lee.

## 4 · Lo embebido, con motivo

| Entidad | Se imprime dentro de | Por qué |
|---|---|---|
| Empresa externa | Proveedor evaluado | «empresa externa» sin decir en qué papel no responde ninguna pregunta |
| Contacto de proveedor | Proveedor evaluado | no tiene identidad de negocio propia |
| Alcance de suministro | Proveedor evaluado | su ficha sería la del proveedor con una fila; sus dos documentos con identidad —criticidad y decisión— sí existen aparte |
| Documento de proveedor | Proveedor evaluado | es evidencia; el archivo original vive donde lo emitieron |
| Plantilla de evaluación | Evaluación de proveedor | los criterios se imprimen dentro de la evaluación que los usó: es la única forma de que el papel diga con qué se midió |
| Incidente de proveedor | Proveedor evaluado / Desempeño | es un hecho anotado; cuando merece tratamiento se abre un caso, y el caso sí tiene su documento |

## 5 · Alcanzabilidad

Las trece se ofrecen desde alguna pantalla. La prueba H1 de `test:export01`
recorre el registro y falla si alguna no tiene botón: una exportación que nadie
puede pulsar no existe.

## 6 · La evaluación, como documento del pasado

`quality.supplier-evaluation.detail` es `historical` de verdad, no por cortesía:
la evaluación guarda su `version_id`, y el adaptador lee los criterios y los
pesos de **esa** versión. El papel lo dice:

> «Los criterios y los pesos son los de la versión con la que se hizo esta
> evaluación, no los de la plantilla de hoy.»
