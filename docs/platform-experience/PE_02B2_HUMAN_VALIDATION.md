# PE-02B2 · Validación humana

Lo automatizado está en verde: 91 comprobaciones nuevas, las matrices A–P y
Q–AC, los permisos probados con tres sesiones distintas. **No hace falta repetir
nada de eso.**

Lo que hay que mirar es si la consola se entiende. Nueve preguntas, y para cada
una basta un sí, un no o un «dudoso».

---

## Antes de empezar

Hace falta entrar a `/platform` con una cuenta de superadministrador. La consola
está en el menú de la izquierda: **Preguntas frecuentes** y **Documentos
legales**.

---

## FAQ

### 1 · ¿Se distingue el borrador de lo publicado?

Abre una pregunta cualquiera. Arriba están las dos cosas, una al lado de la
otra.

**Qué mirar:** si en tres segundos sabes cuál de los dos textos está en la calle
ahora mismo. Y si al guardar un cambio en el borrador, queda claro que lo
publicado **no** se movió.

**Sería un fallo:** tener que deducirlo, o quedarte con la duda de si acabas de
cambiar algo que ya estaba publicado.

### 2 · ¿La vista previa se puede usar sin miedo?

Cambia la visibilidad de una pregunta a «Con sesión» y mira la vista previa.

**Qué debería pasar:** la cara pública deja de pintar la respuesta y dice que no
aparecerá para quien no haya iniciado sesión.

**Qué mirar:** si te queda claro que **nada de lo que ves ahí está publicado**.

### 3 · ¿Publicar es evidente sin ser accidental?

**Qué mirar:** si encuentras el botón sin buscarlo, y si podrías pulsarlo por
error creyendo que solo estabas guardando.

**Sería un fallo:** que «Guardar borrador» y «Publicar» se confundan, o que
publicar parezca el paso natural de guardar.

### 4 · ¿Se entiende por qué una respuesta de seguridad no se puede publicar?

Crea una pregunta en la categoría **Seguridad y privacidad**, escríbela, y
déjala en «Sin comprobar». Intenta publicarla.

**Qué debería pasar:** antes de pulsar nada, un aviso dice que no se puede y
**qué hacer**. Si aun así lo pulsas, el rechazo llega con la misma explicación.

**Qué mirar:** si el aviso te dice qué te falta, o solo que no puedes.

**Pregunta honesta:** ¿te parece una traba burocrática, o te parece razonable?
Si lo primero, dilo — la barrera está puesta a propósito, pero la redacción se
puede mejorar.

### 5 · ¿La historia se entiende?

Baja al final de una pregunta que se haya publicado dos veces.

**Qué mirar:** si puedes contestar «¿qué decía esto en tal fecha, y quién lo
cambió?» sin preguntarle a nadie. Y si «Recuperar la versión N como borrador»
hace lo que esperabas: **no** deshace, prepara.

---

## Documentos legales

### 6 · ¿Se distingue lo vigente de lo histórico?

Abre **Documentos legales**.

**Qué mirar:** si de un vistazo sabes cuál es la política de privacidad que se
acepta hoy, y si las demás se leen como historia y no como alternativas.

**Sería un fallo:** que una versión archivada parezca elegible, o que no se
entienda por qué sigue ahí.

### 7 · ¿Queda claro que cambiar una política es crear una versión?

Abre la versión vigente de la política de privacidad.

**Qué debería pasar:** que no haya ningún sitio donde editar su texto, y que se
diga por qué: para cambiar lo que dice se publica una versión nueva.

**Qué mirar:** si te tienta buscar un botón de editar. Si lo buscas, es que no
está suficientemente dicho.

### 8 · ¿Se avisa de lo que provoca publicar?

Crea una versión nueva de **tratamiento de datos** —no de privacidad ni de
términos, para no obligar a todo el mundo a aceptar de nuevo en una prueba— y
llega hasta el bloque de publicar. **No hace falta que lo publiques.**

**Qué mirar:** si el aviso te deja claro que a todas las personas se les volverá
a pedir que acepten, y si la confirmación te parece proporcionada.

### 9 · Lo transversal

**Qué mirar:** si la consola se parece al resto de `/platform`, o parece de otra
aplicación. Y si en algún momento un mensaje de error te dejó sin saber qué
hacer.

---

## Lo que se sabe que sigue pendiente

- **No hay FAQ pública todavía**: lo que publiques no se ve en ninguna parte
  fuera de la consola hasta B3. Es lo previsto.
- **La política de privacidad vigente sigue siendo la preliminar**, la que habla
  solo de Trazaloop CPR y no menciona al proveedor de IA. Ahora se puede
  cambiar sin desplegar; la redacción es una decisión humana, y es lo que
  bloquea publicar la FAQ de seguridad en B5.
- **No se han publicado respuestas de seguridad**: eso es B5.
- **Los carryovers de PE-01** —la portada pública y la copia de `/modules`—
  siguen intactos: son B6.

---

## Cómo devolverlo

Por cada punto: **bien** / **mal** / **dudoso**, y si es mal o dudoso, qué
esperabas ver. Lo dudoso vale tanto como lo roto: si algo obliga a pensar dos
veces, la consola todavía no está terminada.
