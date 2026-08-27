# QUALITY-11 · Privacidad

## 1 · El anonimato de QUALITY-08 se mantiene intacto

Una campaña anónima sigue siendo anónima cuando la observa una regla.

La fuente `customer_metric` observa la **campaña** y lo que lee son **agregados**:
`value`, `previous_value`, `delta`, `sample_size`, `breaks_comparability`. No
toca `quality_survey_responses`, ni `quality_survey_answers`, ni
`quality_survey_invitations`, ni ningún contacto. La comprobación es doble:

- estática — ninguna consulta de QUALITY-11 nombra esas tablas (prueba N2);
- ejecutada — se siembra una campaña anónima real con tres respuestas, se
  calcula su métrica, se dispara la regla, y se comprueba que ni el retrato ni
  la explicación ni el título de la señal contienen el identificador de ninguna
  respuesta ni de ninguna invitación (escenario 15, prueba K1).

## 2 · Las personas no se vigilan

La fuente `competency_evidence` observa **vencimientos**: `valid_until` y
`status`. La etiqueta del sujeto nombra la **competencia**, no juzga a la
persona. No hay ningún campo de puntuación, ranking o productividad en todo el
catálogo.

Cuando una evidencia caduca, la señal dice que un certificado vence. **No**
declara incompetente a nadie: la prueba G1 guarda el nivel y el estado de la
competencia antes del barrido y comprueba que después son los mismos.

## 3 · El retrato es mínimo

`source_snapshot` guarda **solo los campos que las condiciones de la regla
miraron**, no la entidad entera:

```sql
(select coalesce(jsonb_object_agg(c ->> 'field',
                                  v_subject.facts -> (c ->> 'field')), '{}')
   from jsonb_array_elements(v_ver.conditions) c)
```

Una regla con una condición guarda un campo. Es lo justo para explicar por qué
saltó y nada más: el retrato existe para poder responder «¿por qué me avisaste?»
dentro de dos años, no para archivar una copia del registro.

Comprobado: en el escenario 1 el retrato tiene exactamente una clave.

## 4 · Lo que el catálogo no deja observar

`email` · `phone` · `national_id` · `document_number` · `salary` ·
`birth_date`. Ninguno de estos campos existe en las 70 entradas del catálogo, y
una prueba lo comprueba sobre la siembra.

## 5 · Quién ve qué

Las señales, las reglas y las ejecuciones se leen con `is_org_member`: quien
pertenece a la empresa. Gestionarlas exige `admin`, `quality` o `consultant`, y
**publicar** exige `admin` o `quality` — encender una regla es decidir qué
observará la plataforma en nombre de la empresa, y eso se decide desde dentro.
