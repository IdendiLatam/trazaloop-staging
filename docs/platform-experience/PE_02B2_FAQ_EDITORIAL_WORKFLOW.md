# PE-02B2 · Cómo se escribe una respuesta

El recorrido completo, en el orden en que ocurre.

---

## El camino corto

```
crear  →  editar el borrador  →  vista previa  →  publicar
```

Cuatro pasos, y **ninguno de los tres primeros hace nada visible fuera de la
consola**.

---

## 1 · Crear

`/platform/faq` → «Nueva pregunta». Se pide lo mínimo: identificador, categoría,
la pregunta, una respuesta breve, visibilidad y alcance.

**Crear no publica.** Nace en `draft`, con su borrador, y no la ve nadie.

El **identificador** no cambia nunca y no se deriva del texto: una pregunta se
reformula —«¿Puede otra empresa ver mis datos?» pasa a «…mi información?»— y su
identidad no debería moverse con la redacción.

---

## 2 · Editar el borrador

Dos bloques, separados a propósito.

**Lo que se va a leer:** la pregunta, la respuesta breve y el detalle. Primero lo
corto — quien pregunta quiere la respuesta, no el contexto.

**La procedencia, que no se publica:** en qué se apoya, el estado de
verificación, la salvedad si la hay, la política externa y la fecha en que se
comprobó, y cómo de cerca está el texto de una afirmación normativa.

Guardar aquí **no toca lo publicado**. Mientras se corrige, lo que está en la
calle sigue intacto.

---

## 3 · Vista previa

Dos caras: la de quien no ha iniciado sesión y la de quien ya entró. Si la
respuesta está marcada «con sesión», la cara pública lo dice en lugar de
pintarla.

No hace falta desplegar para ver cómo queda, y nada de lo que se ve aquí es
alcanzable desde fuera.

---

## 4 · Publicar

Se pide una **nota del cambio** —qué cambia y por qué—, y al publicar:

- nace la revisión siguiente;
- se cierra la anterior, con su fecha de fin;
- las dos quedan enlazadas;
- la entrada pasa a `published`.

**Publicar lo mismo no crea una revisión.** Una historia llena de revisiones
idénticas no explica nada.

---

## 5 · La barrera, cuando aparece

Una respuesta no se publica si su estado de verificación es «depende de una
política externa sin comprobar», «sin comprobar» o «no se puede afirmar».

La consola lo dice antes, con qué hacer. La base lo rechaza igual. **Las dos
cosas son necesarias**: el aviso es cortesía, el rechazo es la garantía.

Dos reglas más, por el mismo motivo:

- **Una salvedad que no se escribe no es una salvedad.** «Verificada con
  salvedad» sin la salvedad redactada no sale.
- **Una comprobación externa sin fecha no es una comprobación.** La política de
  un tercero cambia; sin fecha no se sabe cuándo dejó de ser cierta.

---

## 6 · Corregir algo ya publicado

```
editar el borrador  →  vista previa  →  publicar
```

Idéntico. Lo publicado no se toca en ningún momento; al publicar, se sucede.

La lista y la ficha muestran **«Borrador con cambios»** mientras el borrador y
lo publicado no coinciden — que es la señal de que hay trabajo a medio terminar.

---

## 7 · Volver atrás

En la historia, cada versión cerrada ofrece **«Recuperar como borrador»**. Copia
su texto al borrador; desde ahí se revisa y se publica como versión nueva.

**Nunca se reabre una versión antigua.** Reabrir haría que la historia dijera
que ese texto estuvo vigente en dos periodos distintos sin decir que hubo otro
en medio.

---

## 8 · Retirar

Retirar deja de mostrarla. **No borra nada**: el texto y la historia se
conservan, y se puede volver a publicar.

Un borrador que nunca se publicó sigue siendo un borrador aunque se pida
retirarlo: convertirlo en «retirado» diría que estuvo publicado.

---

## 9 · Sobre borrar · §11

**No hay borrado destructivo, y no lo habrá.** La regla final:

| Qué | Se puede |
|---|---|
| Una revisión publicada | **no** se borra ni se edita, por nadie, ni con la clave de servicio |
| Una entrada publicada alguna vez | se **retira**; su identidad y su historia se conservan |
| Una entrada en `draft` que nunca se publicó | hoy tampoco se borra desde la consola |

Sobre lo último: B1 no creó una función para descartar una entrada de FAQ nunca
publicada, y B2 no la ha añadido. Una entrada así no molesta a nadie —no se ve
en ninguna parte salvo en la consola, y los filtros de estado la apartan— y
añadir un botón de borrar por comodidad abriría una puerta que después hay que
vigilar. Si aparece la necesidad real de limpiar identidades abandonadas, será
una función acotada a `status = 'draft'` **sin revisiones**, igual que
`legal_discard_draft`.

---

## 10 · Qué se escribe, y qué no

La frontera editorial de PE-02A (PEH-13) sigue en pie:

> La FAQ explica **cómo funciona Trazaloop**. No le dice a esta empresa qué debe
> hacer.

| Sí | No |
|---|---|
| «Un proceso se relaciona con un riesgo desde la ficha del riesgo» | «Deberías registrar estos cinco riesgos» |
| «La norma pide determinar las partes interesadas» | «Tus partes interesadas son…» |
| «Relacionado con ISO 9001:2015, 6.1» | «Esto garantiza el cumplimiento de ISO 9001» |

Y para la categoría de seguridad, la consola lo recuerda al editar: *antes de
publicarla, deja escrito en qué se apoya — quien la lea dentro de un año tiene
que poder comprobarlo.*
