# QUALITY-12 · El catálogo de fuentes

**Diecinueve fuentes declaradas en la base, once adaptadores implementados.**
Lo que el Copilot puede mirar está escrito, y solo eso.

## 1 · Lo que declara cada fuente

| Campo | Para qué |
|---|---|
| `code` · `label` · `domain` | qué es y de qué dominio |
| `entity_type` | qué entidad de Trazaloop representa |
| `privacy_class` | `open` · `people` · `anonymous` · `restricted` |
| `historical_mode` | `current` · `period` · `as_of` |
| `permission_note` | qué hace falta para leerla, en el lenguaje de permisos real |
| `deep_link` | dónde se abre en la aplicación |

Es catálogo de **plataforma**: sin `organization_id`, solo lectura, y ninguna
empresa lo edita. La misma decisión que en QUALITY-11, por la misma razón.

## 2 · Las diecinueve

| Fuente | Dominio | Privacidad | Tiempo | Adaptador |
|---|---|---|---|---|
| `process` | procesos | open | as_of | ✔ |
| `document_revision` | documentos | open | as_of | — (ver §5) |
| `objective` | objetivos | open | period | — |
| `indicator` | indicadores | open | **as_of** | ✔ |
| `case` | casos y NC | open | period | ✔ |
| `action` | acciones | open | period | ✔ |
| `risk` | riesgos | open | as_of | ✔ |
| `control` | controles | open | current | — |
| `person_competence` | personas | **people** | current | ✔ |
| `knowledge_item` | conocimiento | open | current | — |
| `supplier` | proveedores | open | period | ✔ |
| `customer_metric` | voz del cliente | **anonymous** | period | ✔ |
| `customer_comment` | voz del cliente | **anonymous** | period | ✔ |
| `customer_feedback` | voz del cliente | restricted | period | — |
| `audit` | auditorías | restricted | period | ✔ |
| `management_review` | revisión | restricted | as_of | ✔ |
| `signal` | automatización | open | current | ✔ |
| `automation_rule` | automatización | open | current | — |
| `task` | trabajo | open | current | ✔ |

## 3 · Las cuatro clases de privacidad

**`open`** — información del sistema de gestión sin personas dentro. La lee
cualquier miembro de la empresa.

**`people`** — toca a personas identificables. Exige el interruptor
`allow_people`, apagado por omisión. Y aun encendido, lo único que se lee son
**brechas ya calculadas frente al perfil del cargo**: nunca desempeño, nunca
evaluaciones, nunca nada que ordene a nadie.

**`anonymous`** — agregados de respuestas anónimas y el texto de los
comentarios. La identidad **no existe** en la proyección que se lee: no es que
se filtre, es que la vista no tiene esas columnas.

**`restricted`** — exige comprobación adicional por fila. Las notas restringidas
de auditoría, por ejemplo, quedan fuera porque la RLS de QUALITY-09 no las
devuelve a quien no debe verlas, y el Copilot lee con la sesión de esa persona.

## 4 · Los tres modos temporales

**`current`** — solo el estado de hoy. Si la pregunta es histórica, esta fuente
declara su limitación y la respuesta lo dice.

**`period`** — se puede acotar a un rango de fechas.

**`as_of`** — sabe reconstruir cómo estaba en una fecha. Es lo que permite que
«¿cómo iba el indicador en 2027?» devuelva el 82 de 2027 y no el 90 de hoy.

## 5 · Las ocho fuentes declaradas sin adaptador todavía

`document_revision`, `objective`, `control`, `knowledge_item`,
`customer_feedback`, `automation_rule` y el resto están **en el catálogo** —con
su privacidad y su semántica temporal escritas— pero su adaptador no está
implementado en esta entrega.

Es deliberado y se declara: once adaptadores cubren los casos de uso que el
encargo pide (§107…§112) y los diez dominios que importan para «qué requiere
atención». Añadir los ocho restantes es trabajo mecánico sobre un patrón ya
probado, no una decisión de arquitectura pendiente.

Está declarado como **GAP-02** en el informe.

## 6 · Lo que el catálogo no permite observar

Ni un correo, ni un teléfono, ni un documento de identidad, ni un salario, ni
una respuesta de encuesta identificable, ni una evaluación de desempeño
individual, ni nada de otra empresa. No hay fuente que lo declare, y sin fuente
no hay adaptador, y sin adaptador no hay contexto.
