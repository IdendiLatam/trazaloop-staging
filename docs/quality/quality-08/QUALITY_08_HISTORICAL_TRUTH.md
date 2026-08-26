# QUALITY-08 · Verdad histórica

> **VC-11 · VC-12 · VC-23 · §16, §36, §37, §50, §61, §73**

## 1 · Qué preguntaba la encuesta en marzo

```
quality_survey_version_on(org, survey, fecha)
  → la versión que regía ESE día
quality_survey_version_structure(org, version)
  → sus preguntas, orden, tipos, obligatoriedad, opciones y escalas
```

Las dos comprueban la pertenencia antes de responder, y devuelven vacío —no
«denegado»— para quien no es miembro: confirmar que algo existe en otra empresa
ya es información.

## 2 · Cada respuesta con su versión

`quality_survey_responses.version_id not null`, y un disparador exige que sea la
versión de su campaña. La estructura se lee de ahí, no de la plantilla de hoy.

Publicar la v2 no toca ni una respuesta de la v1. La suite lo demuestra: publica
una versión nueva que cambia la escala de 1–5 a 0–10 y después comprueba que la
respuesta anterior conserva su versión, su valor y sus tres preguntas.

## 3 · Cada resultado con su método

`method_snapshot` congela método, pregunta, escala y umbral. `comparability_key`
es la firma del instrumento. Cambiar la fórmula mañana no reescribe lo que
significó el número de ayer, y la serie se corta donde el instrumento cambió.

## 4 · Los actos que no se reescriben

| Registro | Qué lo protege |
|---|---|
| Versión publicada | `quality_survey_version_is_published` |
| Respuesta enviada | `quality_response_is_submitted` |
| Valores de una enviada | `quality_answer_parent_is_open` |
| Resultado de métrica | `quality_ro_record_is_immutable` |
| Cierre del periodo | `quality_voice_review_is_closed` |
| Anonimato de la campaña | `quality_campaign_anonymity_is_final` |

## 5 · §61 · Corregir sin sobrescribir

Una respuesta enviada admite exactamente una transición: quedar marcada como
sustituida. La corrección es **otra fila**, con `supersedes_id` y su nota. Las
dos se conservan.

Para las anónimas ese camino está cerrado de hecho: sin identidad no se sabe
cuál corregir, y forzarlo exigiría introducir lo que se prometió no guardar.

## 6 · VC-05, VC-06 · El cierre del periodo

`quality_customer_voice_reviews` congela `summary_snapshot` el día que se cierra:
campañas, respuestas, quejas, felicitaciones, señales abiertas y todas las
métricas con su clave de comparabilidad.

Y exige un **veredicto sobre la metodología**: adecuada, hay que cambiarla, o ya
se cambió. Una medición que se repite sin revisarse acaba midiendo lo que ya no
importa.

El cierre deja además una `work_decision` con `subject_kind =
'customer_voice_review'`, para que la Revisión por la Dirección (§53) pueda
consumirla sin duplicar nada cuando llegue.

## 7 · Qué NO se puede reconstruir, y se dice

Nueve documentos declaran `HISTORICAL_NOT_SUPPORTED` con su motivo escrito. Los
tres que más importan:

| Documento | Por qué |
|---|---|
| Ficha de cliente | reúne lo que dijo hasta hoy; cada manifestación y cada respuesta sí llevan su fecha |
| Reporte de satisfacción | consolida lo medido hasta hoy; el cierre del periodo sí congela su retrato |
| Reporte de tendencia | se compone con las mediciones que existen hoy; cada una sí lleva su método congelado |

`HISTORICAL_NOT_SUPPORTED` nunca significa que falte el PDF actual: los tres
existen y se descargan. Lo que no hacen es presentarse como documentos de una
fecha que no pueden probar.

## 8 · Y los que sí son del pasado

Cinco claves con `temporality: "historical"`:

- `quality.survey-version.detail` — su estructura, congelada;
- `quality.survey-campaign.detail` — su versión y sus respuestas inmutables;
- `quality.survey-response.detail` — enviada es final;
- `quality.customer-voice-review.detail` — cerrado es inmutable.
