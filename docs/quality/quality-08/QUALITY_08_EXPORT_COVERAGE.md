# QUALITY-08 · Cobertura de exportación

> **§69, §70, §71, §72, §73, §74, §75, §107**

## 1 · Quince claves, ninguna puerta nueva

| Clave | Tipo | Temporalidad |
|---|---|---|
| `quality.customer.detail` | ficha | current |
| `quality.customer.list` | listado | current |
| `quality.survey.detail` | ficha | current |
| `quality.survey.list` | listado | current |
| `quality.survey-version.detail` | ficha | **historical** |
| `quality.survey-campaign.detail` | informe | **historical** |
| `quality.survey-campaign.list` | listado | current |
| `quality.survey-response.detail` | ficha | **historical** |
| `quality.customer-feedback.detail` | ficha | current |
| `quality.customer-feedback.list` | listado | current |
| `quality.customer-complaint.detail` | ficha | current |
| `quality.customer-complaint.list` | listado | current |
| `quality.customer-satisfaction.list` | reporte | current |
| `quality.customer-voice-trend.list` | reporte | current |
| `quality.customer-voice-review.detail` | ficha | **historical** |

Inventario: **159 entidades · 138 claves · 0 PENDING**.
**Q08_EXPORT_PENDING = 0.**

## 2 · §71 · Un PDF no concede privilegios, y no rompe una promesa

**El documento individual de una respuesta ANÓNIMA no se genera.**

`quality.survey-response.detail` comprueba el modo de la campaña y devuelve
`null` si es anónima. Un papel con la fecha exacta y el contenido completo de
una respuesta anónima es el primer paso para cruzarlo con la lista de
invitaciones: no basta con quitarle el nombre.

Y el informe de campaña, para las anónimas:

- no lleva ninguna columna de identidad —esos datos no existen en la fila—;
- imprime los comentarios **sin atribución**;
- **no publica el desglose ni los comentarios** cuando hay menos de tres
  respuestas (§45), y dice por qué.

## 3 · §75 · El papel de una queja NO se llama no conformidad

`documentName: "Queja o reclamo de cliente"`, y el cuerpo lleva la nota que las
separa. Un documento que dijera «no conformidad» donde el sistema dice «queja»
convertiría un hecho en una clasificación que nadie decidió — y es el papel que
alguien enseñaría en una auditoría creyendo que dice lo que no dice.

Contiene: origen, cliente o contexto, descripción, fechas, responsable,
valoración, referencia al caso si se creó, y estado. Y una nota final que
explica que el caso nació **sin clasificar**.

El listado lleva además la advertencia explícita: *«Este listado NO es un
listado de no conformidades.»*

## 4 · §73 · La versión de encuesta, exactamente como fue

`quality.survey-version.detail` lee `quality_survey_version_structure()` —la
estructura congelada— y no se reconstruye con las preguntas de hoy. Imprime
preguntas, orden, tipo, obligatoriedad, admisión de «no aplica», escalas y
opciones, con su vigencia y su estado.

Es `historical` de verdad: la versión publicada no se puede reescribir.

## 5 · §74 · El informe de campaña

Incluye lo que pide el encargo, y una cosa más:

| Sección | Contenido |
|---|---|
| Qué se midió | encuesta, versión, fuente, modo, periodo, estado |
| Cobertura | respuestas · enlaces · población · **tasa solo con denominador verdadero** |
| Resultados | métrica, método, resultado, muestra, no aplica, sin responder, **comparabilidad** |
| Qué contestaron | desglose por pregunta, sujeto al umbral de reidentificación |
| Comentarios | sin atribución, sujetos al mismo umbral |

Con cero respuestas dice «Sin respuestas» y añade que eso no es cero
satisfacción. Con series rotas, imprime la advertencia de comparabilidad.

## 6 · Nombres sin colisión

PCR ya tenía «Requisito de cliente» y QUALITY-07 «Proveedor evaluado». Las
entidades nuevas llevan apellido: **Cliente del sistema de gestión**, **Contacto
de cliente**, **Encuesta de satisfacción**, **Versión de encuesta**, **Pregunta
de encuesta**, **Campaña de satisfacción**, **Invitación a encuesta**,
**Respuesta identificada de encuesta**, **Respuesta anónima de encuesta**,
**Manifestación de cliente**, **Queja o reclamo de cliente**, **Tema de la voz
del cliente**, **Métrica de satisfacción**, **Informe de satisfacción del
cliente**, **Tendencia de la voz del cliente**, **Señal de la voz del cliente**,
**Cierre del periodo de satisfacción**.

Una prueba falla si aparece un nombre repetido: dos filas con el mismo nombre
convierten el inventario en una trampa.

La nomenclatura de la plataforma manda sobre la del dominio: todo listado se
llama «Listado…» o «Reporte…», así que el informe de satisfacción es **«Reporte
de satisfacción del cliente»** y la tendencia **«Reporte de tendencia de la voz
del cliente»**.

## 7 · Lo embebido, con motivo

| Entidad | Dentro de | Por qué |
|---|---|---|
| Contacto de cliente | Cliente | no tiene identidad de negocio propia |
| Pregunta de encuesta | Versión | fuera de su versión no significa nada |
| Invitación a encuesta | Campaña | **no se imprime junto a las respuestas**: cruzar las dos listas rompería el anonimato |
| Métrica de satisfacción | Reporte de satisfacción | su información cabe en la fila del listado |
| Señal de la voz del cliente | Reporte de satisfacción | su valor está en el conjunto |
| Tema | Manifestación | catálogo, se lee donde se usa |

Y una entidad **no documentable**, con motivo: la **respuesta anónima**.

## 8 · §70 · El encabezado corporativo

Los quince pasan por `organizationIdentity()` y el renderizador común, así que
llevan logo, nombre de empresa y nombre de documento en **todas** las páginas,
con la normalización canónica de EXPORT-01.3. Ninguno tiene endpoint propio.

## 9 · Alcanzabilidad

Las quince se ofrecen desde alguna pantalla. La prueba H1 de `test:export01`
recorre el registro y falla si alguna no tiene botón: una exportación que nadie
puede pulsar no existe.
