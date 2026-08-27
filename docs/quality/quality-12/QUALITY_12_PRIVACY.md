# QUALITY-12 · Privacidad

## 1 · El anonimato de QUALITY-08 se mantiene · absoluto (§32)

El Copilot puede analizar comentarios de encuestas anónimas. Lo que **no**
recibe es identidad, y no la recibe porque no existe en lo que lee:

```sql
create or replace view public.v_quality_campaign_comments as
select a.organization_id, c.id as campaign_id, c.name as campaign_name,
       c.anonymity_mode, q.label as question_label, a.value_text as comment_text
from quality_survey_answers a ...
```

No hay `response_id`, ni `invitation_id`, ni `customer_id`, ni `contact_id`, ni
`respondent_name`, ni `respondent_email`, ni `submitted_at` —que en una campaña
pequeña es un rastro tan bueno como un nombre—.

La garantía está en la **forma de la vista**, no en que el adaptador se acuerde
de no pedir la columna. Una prueba lee la definición de la vista y comprueba que
ninguna de esas columnas aparece.

## 2 · Grupos pequeños (§33)

La política prohíbe explícitamente deducir identidad «ni siquiera por deducción
a partir de fechas, grupos pequeños o cualquier otro rastro». Pero de nuevo: la
protección real es que el contexto no trae fechas de envío, ni tamaños de
subgrupo, ni el cliente asociado. No hay con qué deducir.

## 3 · Personas (§34)

El adaptador `person_competence`:

- exige `allow_people`, que nace **apagado**;
- lee `v_quality_competence_matrix`, que es la **brecha ya calculada** frente al
  perfil del cargo;
- habla de **cargos y competencias**, no de nombres;
- y no toca `quality_performance_evaluations` ni nada parecido.

Una prueba comprueba que dentro de ese adaptador no aparecen las palabras
`performance`, `evaluation`, `score`, `ranking` ni `salary`.

Y las peticiones de alto impacto —«¿a quién despido?», «hazme un ranking»— se
prueban de verdad: se pide, y se comprueba que el sistema no cambia y que la
respuesta no nombra a nadie.

## 4 · Qué se guarda, y qué puede no guardarse (§30, §31)

| Se guarda | Por qué |
|---|---|
| metadatos de la consulta | para poder responder «¿por qué me dijo eso?» |
| las **referencias** | para poder abrir las fuentes |
| la pregunta | **opcional**: `retain_question` |
| la respuesta | **opcional**: `retain_answer` |

**No se guarda el paquete de contexto completo.** Con las referencias y el
retrato mínimo basta para reconstruir de dónde salió cada afirmación; guardar el
texto entero sería duplicar datos de la empresa en un sitio nuevo sin ganar
nada.

Tampoco se guardan copias de evaluaciones de personas, respuestas anónimas ni
notas de auditoría: no entran al contexto de una forma que haga falta
almacenarlas aparte.

## 5 · Qué sale del servidor (§84)

Hacia el proveedor del modelo salen:

- la pregunta de la persona;
- las fuentes autorizadas que Trazaloop seleccionó, con sus etiquetas;
- los hechos ya calculados;
- los textos registrados que hagan falta, recortados.

No salen: identidades de encuestas anónimas, datos de otras empresas, ni nada
que el rol de quien pregunta no pueda ver.

La interfaz lo dice con estas palabras, y **no** hace afirmaciones legales sobre
el proveedor que no se hayan verificado.

## 6 · No aprende (§83)

> «El Copilot no aprende de tu empresa. En cada consulta se le entrega la
> información autorizada que hace falta para responderla, y nada de eso entrena
> ningún modelo.»

Es exactamente lo que ocurre, dicho con las palabras precisas. Decir «Trazaloop
aprendió de tu empresa» sería falso y además crearía una expectativa —y un
miedo— que el diseño no sostiene.
