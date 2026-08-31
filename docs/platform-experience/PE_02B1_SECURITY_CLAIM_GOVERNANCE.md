# PE-02B1 · Gobierno de las afirmaciones de seguridad

Cómo el esquema impide publicar algo que no se puede sostener.

---

## 1 · El problema

La FAQ va a afirmar cosas sobre aislamiento entre empresas, sobre qué ve el
personal de Trazaloop y sobre qué hace el proveedor del modelo con lo que
recibe. Una afirmación así, publicada sin decir en qué se apoya, **envejece
hasta volverse falsa sin que nadie se entere**.

PE-02A midió el esquema y clasificó cada afirmación. Este tramo convierte esa
clasificación en una barrera de la base.

---

## 2 · Los cinco estados, y qué hace cada uno

| Estado | Significado | ¿Se publica? |
|---|---|---|
| `verified` | comprobado, reproducible | **sí** |
| `verified_with_qualifier` | cierto con una salvedad que hay que decir | **sí**, si la salvedad está escrita |
| `external_policy_verification_required` | depende de un tercero | **NO** |
| `not_verified` | no se pudo comprobar | **NO** |
| `must_not_claim` | publicarlo sería falso | **NO** |

`faq_publish_entry` lanza una excepción para los tres últimos. **No es un aviso
en una pantalla: es un rechazo de la base.** Una barrera que vive en la pantalla
se salta escribiendo en la base; esta no.

Y las revisiones no tienen permiso de escritura para nadie —ni para el
superadministrador—, así que no hay puerta de atrás: la única forma de crear una
revisión es la función que rechaza.

---

## 3 · Dos reglas más, por el mismo motivo

**Una salvedad que no se escribe no es una salvedad.** Publicar
`verified_with_qualifier` con `verification_note` vacío o de menos de diez
caracteres se rechaza, y lo rechazan dos cosas: una restricción de la tabla y la
función de publicación.

Es el caso de la respuesta sobre el acceso del personal de Trazaloop. La
auditoría concluyó que el primer párrafo es cierto y que el segundo —«la
administración técnica de la infraestructura implica acceso a los sistemas»— es
lo que impide que el conjunto sea una mentira. **Sin ese párrafo, la respuesta
no se puede publicar.**

**Una comprobación externa sin fecha no es una comprobación.** Si hay
`external_source_url`, tiene que haber `external_source_checked_on`. La política
de un tercero cambia; sin fecha no se sabe cuándo dejó de ser cierta.

---

## 4 · La política del proveedor no se codifica

§10 del encargo. La política de uso de datos de un proveedor de IA **no vive en
el código de la aplicación**: cambiaría sin que el código se entere. Vive en la
respuesta —que es contenido versionado— con su URL y su fecha de comprobación.

Una prueba estática recorre `lib/`, `server/` y `app/` y falla si encuentra
escrita a mano una afirmación del tipo «no se usan para entrenar», «not used for
training» o «zero data retention».

### La comprobación externa que el humano aportó

El encargo trae verificada la política vigente de OpenAI:

- las entradas y salidas de la API **no se usan para entrenar modelos por
  defecto**, salvo que el cliente lo autorice expresamente;
- pueden **retenerse hasta 30 días** para prestar el servicio y vigilar abusos,
  salvo cuando aplican controles de retención elegibles como ZDR.

De ahí se derivan dos prohibiciones que quedan escritas aquí y que B5 tendrá que
respetar al redactar:

1. **No afirmar «OpenAI nunca retiene los datos».** Es falso: hay retención con
   un plazo.
2. **No inferir retención cero de `store: false`.** `store: false` es lo que
   Trazaloop **pide**; la retención operativa del proveedor es otra cosa. La
   auditoría de PE-02A ya redactaba con cuidado —«se le pide que no conserve»—
   y esa formulación sigue siendo la correcta, pero **ya no basta por sí sola**:
   con la política verificada, la respuesta puede y debe decir el plazo.

**Este tramo no publica ninguna respuesta sobre esto.** Solo deja el sitio, la
barrera y la procedencia. La redacción es de B5, y depende además de que la
política de privacidad mencione al proveedor (§5).

---

## 5 · `legal_documents` · inspección, sin tocar nada · §19

### Lo que hay

| Elemento | Estado |
|---|---|
| Tabla | `id`, `document_type`, `version`, `title`, `content`, `status`, `published_at`, `created_at`, `updated_at` |
| Unicidad | `(document_type, version)` |
| **Uno activo por tipo** | índice único parcial `where status = 'active'` |
| Lectura pública | política `using (status = 'active')` para `{anon, authenticated}` |
| Escritura | `insert` y `update` exigen `is_platform_superadmin()` |
| Aceptación | `user_legal_acceptances` referencia el **`id`** del documento |
| Documentos vigentes | `terms` v1 y `privacy` v1, ambos `active` |

### El hallazgo que importa

**El modelo ya soporta la sucesión.** Publicar una versión nueva es *insertar una
fila nueva* con otra `version` y desactivar la anterior; el índice único parcial
garantiza que solo haya una activa por tipo, y como la aceptación referencia el
**id**, a cada persona se le vuelve a pedir la aceptación automáticamente.

**No hace falta ninguna arquitectura paralela.** B2/B5 pueden añadir la gestión
desde el superadministrador con:

1. una función `security definer` de publicación —insertar la nueva y desactivar
   la anterior en la misma transacción—, con el mismo patrón que
   `faq_publish_entry`;
2. una pantalla de listado y edición, con el mismo patrón que la de estructuras
   de TrazaDocs.

### Los huecos, dichos y no arreglados

| | Hueco | Gravedad |
|---|---|---|
| 1 | **No hay `created_by`**: no consta quién publicó una versión legal | media — es el mismo problema que la FAQ resolvió con `created_by` en la revisión |
| 2 | **`update` está permitido**: un documento activo se puede reescribir en su sitio, sin dejar rastro y sin que nadie tenga que volver a aceptarlo | **alta** — es exactamente el fallo que la FAQ evita con revisiones inmutables |
| 3 | No hay estado de borrador | baja — con la sucesión por filas se puede insertar `inactive` y activar después |
| 4 | El contenido es texto plano sin clasificación normativa ni procedencia | baja |

**El hueco 2 es un hallazgo de esquema real**, y por eso se reporta en vez de
arreglarse: §19 dice explícitamente que no se rediseñe `legal_documents` en esta
migración. La recomendación para B2/B5 es prohibir el `update` del contenido de
un documento activo y obligar a la sucesión, que es lo que el resto del
repositorio ya hace con todo lo que sirve de prueba de algo.

### Y la dependencia que bloquea a B5

La política de privacidad vigente se declara **«versión preliminar … para la
beta de Trazaloop CPR»** y **no menciona al proveedor de IA**. Publicar una FAQ
de seguridad que describa Quality, Textiles e Intelligence mientras el documento
legal habla de otra cosa crea una contradicción entre dos textos públicos.

Es una decisión humana, no un bloqueo técnico. Pero es la razón por la que B5 va
después de B2 y B3.

---

## 6 · Qué tendrá que llevar cada respuesta de seguridad en B5

De las diez preguntas propuestas en PE-02A:

| | Pregunta | Estado previsto | Nota |
|---|---|---|---|
| C1 | ¿Puede otra empresa ver mi información? | `verified` | base: la medición del esquema |
| C2 | ¿Cómo separa los datos? | `verified` | |
| C3 | ¿Puede el equipo de Trazaloop acceder? | `verified_with_qualifier` | **la salvedad es obligatoria y la base la exige** |
| C4 | ¿Cómo se controlan los permisos? | `verified` | |
| C5 | ¿Dónde se guardan mis archivos? | `verified` | sin cifrado en reposo ni ubicación |
| C6 | ¿La IA usa datos de otras empresas? | `verified` | |
| C7 | ¿Qué recibe el proveedor? | `verified` | |
| C8 | ¿Se usan para entrenar modelos? | `verified_with_qualifier` | ahora **publicable**, con URL y fecha, y con el plazo de retención dicho |
| C9 | ¿Las respuestas anónimas lo son? | `verified` | |
| C10 | ¿Hay copias de seguridad? | `verified_with_qualifier` | no afirmar que las restauraciones estén probadas |

C8 cambió de estado gracias a la comprobación externa que aportó el humano. El
esquema ya lo admite; **la redacción es de B5**.
