# PE-02B5A · La política del proveedor de IA

**Regla:** solo material oficial del proveedor. Nada de blogs, resúmenes de
terceros ni foros (§41).

---

## 1 · Qué se pudo comprobar, y qué no

| Página | Estado al 2026-08-31 |
|---|---|
| `openai.com/enterprise-privacy/` | **403** a la consulta automática |
| `openai.com/business-data/` | **403** |
| `help.openai.com/en/articles/5722486-api-data-usage-policies` | **403** |
| `platform.openai.com/docs/guides/your-data` | **301** → redirige |
| **`developers.openai.com/api/docs/guides/your-data`** | **200 · consultada** |

Las tres páginas que nombra el encargo bloquean la consulta automática. La cuarta
—**documentación oficial de OpenAI para desarrolladores**, titulada «Data
controls in the OpenAI platform»— sí respondió, y es de donde sale todo lo que
sigue.

**No lleva fecha de última actualización visible.** Queda anotado: una política
sin fecha propia obliga a fechar **la consulta**.

---

## 2 · Lo que dice, textualmente

### Entrenamiento

> «data sent to the OpenAI API is not used to train or improve OpenAI models
> (unless you explicitly opt in to share data with us)»

*No se usa para entrenar ni mejorar modelos, salvo que el cliente lo autorice
expresamente.*

### Conservación

> los registros de vigilancia de abuso se conservan «for up to 30 days, unless
> longer retention is required by law, or is reasonably necessary to protect our
> services»

**«Hasta 30 días», no «30 días».** Y con dos excepciones dichas en la misma
frase: obligación legal, o necesidad razonable de proteger el servicio.

Hay además puntos finales con reglas propias —asistentes, hilos, almacenes
vectoriales, conversaciones, ficheros y vídeos, que se conservan indefinidamente
o hasta que se borren—. **Trazaloop no usa ninguno de ellos**: usa
`/v1/responses` con `store: false`.

### Retención cero

Zero Data Retention excluye el contenido de los registros de vigilancia de abuso.
Y este es el punto que importa:

> con ZDR activado, el parámetro `store` «will always be treated as `false`, even
> if the request attempts to set the value to `true`»

Es decir: **ZDR implica `store:false`, pero `store:false` NO implica ZDR.** Son
cosas distintas y la documentación lo dice al revés de como se suele leer.

### Revisión humana

La página menciona dos controles —**Eyes Off** y **Safety Retention**— de los que
se deduce que, sin ellos, cierto contenido **puede** entrar en revisión humana:

> «Eyes Off … such content will be excluded from human review unless required by
> applicable law»
>
> «Safety Retention … we may retain and human review customer content when using
> these models»

**No dice** qué personal de OpenAI accede al contenido almacenado; esa
información estaba en las páginas que devolvieron 403.

---

## 3 · Lo que Trazaloop hace, y lo que eso significa

| Lo que hace el código | Lo que significa | Lo que **no** significa |
|---|---|---|
| `store: false` en cada petición | pide al proveedor que no conserve la petición en sus almacenes de la API | **no** es retención cero contractual |
| Sin herramientas: ni web, ni ficheros, ni intérprete | el modelo no puede buscar ni abrir nada | — |
| Solo `instructions` + `input` | solo va el contexto que el servidor seleccionó | — |
| La clave vive en el entorno del servidor | no está en el repositorio ni se imprime | — |

---

## 4 · Lo que NO se puede afirmar

| Frase | Por qué no |
|---|---|
| «OpenAI elimina inmediatamente cada consulta» | la propia política dice «hasta 30 días», con excepciones |
| «`store:false` significa retención cero» | la documentación dice explícitamente lo contrario |
| «Ninguna persona de OpenAI ve nunca el contenido» | existen Eyes Off y Safety Retention precisamente porque, sin ellos, puede haber revisión |
| «Trazaloop tiene retención cero contratada» | **no consta**; ver §5 |
| «Trazaloop no activó el uso para entrenamiento» | **no consta**; ver §5 |

---

## 5 · Lo que depende de una persona, no del repositorio

### 5.1 · Qué proveedor está configurado

El repositorio tiene adaptadores para **OpenAI** y **Anthropic**, y un doble
determinista para cuando no hay ninguno. La variable `QUALITY_AI_PROVIDER` existe
en el entorno de Preview y de Producción, y **su valor está oculto**.

En local no hay proveedor configurado: cae en el doble, que no llama a nadie.

**Consecuencia:** no se puede afirmar desde el repositorio que el proveedor en
producción sea OpenAI. Una FAQ que lo nombre necesita esa confirmación —o debe
redactarse sin nombrarlo—.

### 5.2 · Si la cuenta autorizó el uso para entrenamiento

La política del proveedor es «no se usa **por defecto**, salvo que el cliente lo
autorice». Eso describe el valor por defecto, **no la configuración de nuestra
cuenta**.

Deducir el ajuste de la cuenta a partir del valor por defecto sería exactamente
el error que §18 prohíbe.

**HUMAN_CONFIRMATION_REQUIRED** antes de publicar cualquier frase del tipo
«Trazaloop no ha activado el uso de estos datos para entrenamiento».

### 5.3 · Si hay ZDR o Eyes Off contratados

Tampoco consta. Sin confirmación, la respuesta sobre conservación debe decir
«hasta 30 días» con sus excepciones, y **no** mencionar retención cero.

---

## 6 · Procedencia que se guarda con cada respuesta

Las respuestas de FAQ que dependan de esto llevan, en su metadato:

```
verification_status        external_policy_verification_required → hasta confirmar
                           verified_with_qualifier               → cuando se confirme
external_source_url        https://developers.openai.com/api/docs/guides/your-data
external_source_checked_on 2026-08-31
verification_note          la salvedad que no se puede quitar
```

Y la barrera de 0155 hace el resto: mientras el estado sea
`external_policy_verification_required`, **la base rechaza publicarla**.

---

## 7 · Qué habrá que rehacer en B5B

1. Volver a consultar la página oficial y **cambiar la fecha** si el texto cambió.
2. Confirmar el proveedor real de producción.
3. Confirmar el ajuste de entrenamiento de la cuenta.
4. Confirmar si hay ZDR o Eyes Off.
5. Solo entonces, cambiar el estado de verificación y publicar.
