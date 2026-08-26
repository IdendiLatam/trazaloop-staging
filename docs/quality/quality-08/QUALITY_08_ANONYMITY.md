# QUALITY-08 · Anonimato real

> **VC-08 · VC-29 · §22, §23, §44, §45, §46, §65, §81, §100**

## 1 · La afirmación

Cuando una campaña promete anonimato, **el dato no existe**. No es que la
pantalla lo oculte, ni que un permiso lo esconda: la base se queda sin ninguna
columna que permita reconstruir «respuesta → persona».

Es la diferencia entre un sistema en el que alguien *no debería* mirar y uno en
el que *no hay nada que mirar*. La segunda es la única que sobrevive a un
cambio de administrador.

## 2 · La amenaza concreta

Con enlaces únicos por destinatario —que hacen falta para evitar respuestas
repetidas— la tentación es obvia: guardar `response_id` en la invitación, o
`invitation_id` en la respuesta. Con cualquiera de las dos, el anonimato se
evapora en un `join` de una línea.

Y hay una segunda, más silenciosa: la fila de auditoría. Una tabla auditada
guarda **quién escribió**. Para una respuesta anónima enviada desde una sesión
iniciada, esa columna es exactamente la identidad que se prometió no guardar.

## 3 · El diseño

### 3.1 · Ninguna columna las une

```
quality_survey_invitations        quality_survey_responses
  customer_id     ← a quién         customer_id      ← NULL
  contact_id         se invitó      contact_id       ← NULL
  sent_to_email                     respondent_name  ← NULL
  status = 'used' ← que se usó      respondent_email ← NULL
  used_at                           invitation_id    ← NULL
  ✗ response_id                     ✗ created_by
```

La invitación sabe a quién se invitó y **que** el enlace se usó —eso es lo que
permite saber a cuántos se preguntó (§38)—. La respuesta no sabe de qué
invitación vino. Correlacionarlas exigiría comparar marcas de tiempo, que es una
inferencia, no una consulta.

### 3.2 · La respuesta no tiene autor

`quality_survey_responses` **no tiene** columna `created_by`, no lleva el
disparador `force_created_by` y **no lleva `audit_row_change`**. En su lugar
tiene una guarda de inmutabilidad propia, que es más fuerte que un rastro que
puede delatar a quien escribió.

Es una decisión con coste declarado: se renuncia al rastro de auditoría de esas
dos tablas a cambio del anonimato. La inmutabilidad se sostiene igual, porque
la impone un disparador y no la posibilidad de auditar el cambio.

### 3.3 · La regla la impone la base, no la aplicación

`quality_response_matches_campaign_anonymity()` lee el modo de la CAMPAÑA y
rechaza cualquier respuesta anónima que traiga cliente, contacto, nombre, correo
o invitación. Dispara en `insert` y en `update`, así que tampoco se puede
añadir después.

### 3.4 · Solo hay una puerta de escritura

La RLS **no concede ninguna política de escritura** sobre
`quality_survey_responses` ni sobre `quality_survey_answers`, y el `grant` es
únicamente `select`. La única forma de crear una respuesta es
`quality_submit_survey_response`, que decide qué identidad lleva según el modo
de su campaña.

Sin esa ausencia, cualquiera con rol podría insertar una respuesta «anónima» con
el cliente puesto, y la promesa dependería de que la aplicación se acordara.

La clave de servicio tampoco tiene privilegios sobre estas tablas: se revocaron
a propósito, y la suite lo comprueba.

### 3.5 · El anonimato no se cambia de opinión

`quality_campaign_anonymity_is_final()` impide cambiar el modo en cuanto la
campaña sale de borrador, se invita a alguien o llega una respuesta. Prometer
anonimato y revelarlo después sería la traición más barata de este dominio.

## 4 · Dónde se rompería, y no se rompe

| Camino | Qué lo cierra |
|---|---|
| columna en la respuesta | restricción de tabla + guarda contra la campaña |
| columna en la invitación | no existe `response_id` |
| `update` posterior | la guarda dispara también en `update` |
| autor de la fila | no hay `created_by` ni `force_created_by` |
| `audit_log` | las dos tablas no se auditan |
| escalar un comentario a queja «con cliente» | `quality_feedback_respects_anonymity()` |
| caso abierto desde ese comentario | la RPC no añade la referencia al cliente |
| ficha del cliente | la vista solo cuenta campañas `identified` |
| PDF individual de la respuesta | **no se genera** para campañas anónimas |
| desglose con muy pocas respuestas | umbral de reidentificación |

## 5 · §45 · Grupos diminutos

`SMALL_GROUP_THRESHOLD = 3`. Por debajo de tres respuestas, ni la pantalla ni el
PDF publican el desglose ni los comentarios: dicen que hay muy pocas para
mostrarlas sin arriesgar el anonimato.

No es estadística fina, y no pretende serlo. Es no publicar «la única respuesta
anónima del departamento X», que es como se reidentifica en la práctica.

## 6 · §46 · Los comentarios libres

Un comentario puede contener datos personales que quien escribe puso sin
pensarlo. Se tratan con el mismo permiso que el resto del dominio, se imprimen
**sin atribución** y no se usan para buscarle dueño a una respuesta anónima.

El papel lo dice con todas las letras: *«si alguno permitiera reconocer a quien
lo escribió, eso es una razón para tratarlo con cuidado, no para buscarle
dueño.»*

## 7 · Y lo que SÍ se puede hacer

Todo lo que hace útil una encuesta anónima:

- leer el **resultado agregado** y su distribución;
- leer los **comentarios**, sin atribución;
- saber a **cuántos se invitó** y cuántos respondieron;
- calcular la **tasa de respuesta**;
- ver la **tendencia** entre periodos comparables.

Lo único que no se puede es saber quién dijo qué. Que es exactamente lo que se
prometió.

## 8 · Cómo se comprueba

`test:quality08` bloque **G** (11 comprobaciones estáticas) busca activamente el
camino que rompería la promesa: la columna, el disparador que falta, la política
de escritura, la auditoría.

`test:quality08-rls` bloque **F** (8 comprobaciones contra base real) lo
ejecuta: crea una campaña anónima, responde tres veces por el enlace público, y
después intenta —con la sesión de mayor rol y con la clave de servicio—
recuperar la identidad por columna, por join, por auditoría y por la ficha del
cliente. Cero fugas, en Local y en Staging.
