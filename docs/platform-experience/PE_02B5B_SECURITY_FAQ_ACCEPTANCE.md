# PE-02B5B · Las quince respuestas, publicadas

Aceptación técnica de la publicación de la categoría **Seguridad y privacidad**.

---

## 1 · Qué se publicó

Quince respuestas, por `faq_publish_entry`, una a una, cada una con su nota de
cambio. Ninguna se insertó a mano.

| | Respuesta | Visibilidad | Destacada | Verificación |
|---|---|---|---|---|
| 1 | ¿Cómo protege Trazaloop la información de mi empresa? | pública | sí | verificada |
| 2 | ¿Puede otra empresa ver mi información? | pública | sí | verificada |
| 3 | ¿Cómo separa Trazaloop la información entre empresas? | pública | no | verificada |
| 4 | ¿Puede el equipo de Trazaloop acceder a los datos de mi empresa? | pública | sí | **con salvedad** |
| 5 | ¿Cómo protege Trazaloop mis archivos y evidencias? | con sesión | no | verificada |
| 6 | ¿Cómo se controlan los permisos de las personas? | con sesión | no | verificada |
| 7 | ¿Cómo protege Trazaloop Intelligence la información? | con sesión | no | verificada |
| 8 | ¿La IA utiliza información de otras empresas para responderme? | pública | sí | verificada |
| 9 | ¿Qué información recibe el proveedor de IA? | pública | no | verificada |
| 10 | ¿Mis datos se utilizan para entrenar modelos? | pública | sí | **con salvedad** |
| 11 | ¿Cuánto tiempo puede conservar el proveedor la información? | pública | no | **con salvedad** |
| 12 | ¿El modelo de IA puede acceder a la base de datos? | pública | no | verificada |
| 13 | ¿Puede Intelligence modificar o aprobar por su cuenta? | con sesión | no | verificada |
| 14 | ¿Cómo se protege la identidad en las respuestas anónimas? | con sesión | no | verificada |
| 15 | ¿Qué información puede hacerse pública en Trazaloop? | pública | no | verificada |

**Diez públicas, cinco con sesión, cinco destacadas.** Coincide con lo declarado
en la base antes de publicar.

---

## 2 · Lo que sobrevivió a la publicación

Publicar copia el borrador a una revisión inmutable. Ahí es donde una afirmación
puede perder la mitad que la hace verdadera sin que nadie lo note.

| Qué podía perderse | Comprobado |
|---|---|
| La salvedad de infraestructura de la 4 | **está** · «la administración técnica de la infraestructura implica acceso a los sistemas» |
| Que no hay ningún «nunca» absoluto en la 4 | **ninguno** |
| Las dos mitades de la 10 | **las dos** · la política del proveedor *y* «Trazaloop no ha activado la autorización» |
| Que la 10 no promete un «nunca» del proveedor | **no lo promete** |
| Que la 11 dice que **no** hay retención cero | **lo dice** |
| Que la 11 distingue `store:false` de retención cero | **lo distingue** |
| Que la 11 abre con el dato | **«Hasta 30 días.»** |
| El límite declarado de la 1 | **está** · «Ninguna medida elimina el riesgo por completo» |
| La procedencia de las quince | **las quince** |
| Fuente externa y fecha de las dos de IA | **las dos** · `developers.openai.com`, consultada el 2026-08-31 |

---

## 3 · Visibilidad

**Diez públicas**, verificadas leyendo `v_faq_public` sin sesión.

**Cinco con sesión**, y ninguna de ellas se lee sin ella. Se comprobó de tres
maneras, porque un filtro puede fallar por una sola:

1. consultando la vista pública por sus identificadores;
2. **buscándolas por su texto** — que es como se encuentra una respuesta de
   verdad, y donde un filtro incompleto se nota;
3. **abriendo su página** sin sesión: responde con cortesía —«No encontramos esa
   pregunta»— y **sin una línea del contenido**.

Con sesión se leen las quince.

---

## 4 · El metadato no se publicó

La vista pública no expone `verification_status`, `source_basis`,
`verification_note`, `external_source_url` ni `external_source_checked_on`. Se
comprobó columna por columna sobre la vista, y también abriendo la página de la
respuesta bandera y buscando cada uno de esos rastros.

Ninguna respuesta publicada nombra al proveedor de IA, ni su modelo, ni ninguna
variable de configuración del servidor. Se comprobó sobre las quince.

---

## 5 · La categoría aparece sola

**No se nombró «seguridad» en ningún sitio del código.** `v_faq_public_categories`
ofrece una categoría cuando tiene contenido publicado y visible debajo, así que
apareció al publicar la primera y desaparecería sola si se retiraran todas.

Se comprobó además, sobre todas las categorías ofrecidas, que **ninguna se ofrece
vacía**.

Las destacadas también son dato: las cinco marcadas llegan destacadas a la vista,
y ninguna de sesión se destaca a un visitante.

---

## 6 · Búsqueda

Buscar en español natural encuentra contenido de seguridad y no filtra nada:

| Término | Encuentra | ¿Filtra alguna de sesión? |
|---|---|---|
| seguridad | sí | no |
| otra empresa | sí | no |
| inteligencia artificial | sí | no |
| entrenamiento | sí | no |
| archivos | sí | no |
| acceso | sí | no |

Sin incrustaciones ni IA: es la búsqueda de texto en español de Postgres sobre
`search_document`.

### Una observación editorial, pequeña

Buscar **«inteligencia artificial»** encuentra dos respuestas de IA, pero **no**
la número 8 —«¿La IA utiliza información de otras empresas para responderme?»—,
porque su texto usa **«IA»** y no la expresión completa. Buscando «IA» sí sale.

No es un fallo de la búsqueda ni de la publicación: es una palabra que falta en
una respuesta. Se deja **anotado para decisión editorial**, no corregido: editar
un texto ya aprobado y publicado es una decisión de quien lo aprobó. La
corrección sería de una línea y no exigiría reaceptación de nada.

---

## 7 · Lo que no cambió

La ayuda contextual siguió funcionando igual: las once ayudas de partes
interesadas siguen publicadas y se leen desde la base. Publicar contenido legal y
publicar ayuda no se tocan, y esta comprobación es la que lo demuestra.

Las veinticuatro respuestas anteriores siguen publicadas. El total pasó de 24 a
**39**.
