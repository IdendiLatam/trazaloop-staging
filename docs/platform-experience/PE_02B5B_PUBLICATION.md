# PE-02B5B · La publicación, y cómo se hizo

El 31 de agosto de 2026 la dirección del producto aprobó publicar en Staging la
política de privacidad v1.1 y las quince respuestas de seguridad. Este documento
dice qué había antes, qué se hizo, y qué hay ahora.

**Solo Local y Staging. Producción no se tocó.**

---

## 1 · La instantánea previa

Tomada antes de escribir nada, y guardada como prueba.

### Staging · 2026-08-31 20:57 UTC

| | |
|---|---|
| Política vigente | `privacy v1` · `ecc15d5a-…` · publicada el 2026-08-19 · md5 `9f3719ca…` · 1 100 caracteres |
| Sucesora | `v1.1-draft` · `36f88739-…` · borrador · md5 `a963c09e…` · 24 868 caracteres |
| Términos vigentes | `terms v1` · `22e33050-…` |
| Aceptaciones de `privacy v1` | **153** |
| Aceptaciones de `terms v1` | 153 |
| FAQ de seguridad | 15 borradores · **0 publicadas** · **0 revisiones** |
| Visibilidad declarada | **10 públicas · 5 con sesión** |
| Destacadas | 5 |
| FAQ publicadas en total | 24 |
| Ayudas contextuales publicadas | 11 |
| Cabecera de migración | **0158** |

> La división 10/5 se leyó de la base, no de la documentación. El encargo pedía
> comprobarlo antes de publicar, y coincide.

### Local

Mismo estado, con los mismos resúmenes de contenido: `9f3719ca…` para la v1 y
`a963c09e…` para la sucesora. Local arrastra además 40 entradas de seguridad de
residuo de las suites de prueba, que **no** se publicaron.

---

## 2 · Cómo se publicó

`scripts/pe02b5b/publicar.sql`, ejecutado primero en Local como ensayo y después
en Staging.

### Ni un solo `update` a mano

El guion no escribe `status = 'active'` en ninguna parte. Publicar una política
no es cambiar un estado: es archivar la vigente con su fecha de retiro, activar
la nueva, enlazarlas en los dos sentidos y dejar constancia de quién publicó.
`legal_publish_document` hace las cuatro cosas en una transacción; a mano habría
que acertar las cuatro, hoy y cada vez.

Lo mismo con la FAQ. `faq_publish_entry` copia el borrador a una revisión
inmutable **y vuelve a pasar la barrera de verificación**. Insertar la revisión
directamente se saltaría esa barrera, que es justo lo que la barrera existe para
impedir.

### Con identidad, no con privilegio

Las dos funciones exigen `is_platform_superadmin()`, que lee `auth.uid()`. Desde
`psql` sin más, `auth.uid()` es nulo y las dos fallan — como deben. Así que se
hizo lo que hace la pasarela cuando alguien pulsa el botón: declarar la sesión y
bajar al rol `authenticated`.

**La comprobación de autorización se ejecutó y tuvo que pasar.** El guion
comprueba primero `is_platform_superadmin()` y aborta si no. La publicación
quedó atribuida a `qa-a@trazaloop-staging.local`, que es el único
superadministrador activo de Staging.

### El nombre de la versión

El borrador se llamaba `v1.1-draft`, que era un nombre de trabajo. Lo que se
publicó se llama **`v1.1`**, porque es lo que el propio artículo 21 declara y es
lo que se ve junto al título.

No se renombró la fila: se creó la versión `v1.1` con `legal_create_draft` —la
única vía que fija una versión y recalcula el resumen de contenido—, se comprobó
que el contenido copiado coincidía **byte a byte** con el revisado, se publicó, y
el borrador de trabajo se descartó.

Si la copia no hubiera coincidido, el guion habría abortado antes de publicar.

### La lista de las quince, escrita a mano

A propósito. Publicar «todo lo que haya en la categoría» habría publicado también
el residuo de las suites de prueba de la base local. Y si faltara alguna de las
quince, el guion aborta: media categoría publicada es peor que ninguna.

---

## 3 · Qué hay ahora

### Staging · 2026-08-31 21:01 UTC

| | |
|---|---|
| **Política vigente** | **`privacy v1.1`** · `25820c4f-…` · publicada el 2026-08-31 21:01 |
| Política histórica | `privacy v1` · **archivada** · retirada el 2026-08-31 21:01 · md5 `9f3719ca…` **sin cambiar** |
| Enlaces | v1 → v1.1 y v1.1 → v1, en los dos sentidos |
| Publicada por | `c74b82bf-…` (`qa-a@trazaloop-staging.local`) |
| Políticas activas | **1** |
| Borrador de trabajo | descartado |
| Aceptaciones de v1 | **153, intactas** |
| Aceptaciones de v1.1 | **0** — nadie quedó aceptado sin aceptar |
| FAQ de seguridad | **15 publicadas** · 15 revisiones vigentes · 0 cerradas |
| Verificación conservada | 12 `verified` + 3 `verified_with_qualifier` |
| Con fuente externa y fecha | 2 |
| FAQ publicadas en total | **39** |
| Cabecera de migración | **0158** — sin migración |

### Local

Idéntico, con los mismos resúmenes.

---

## 4 · Lo que se comprobó después

**La v1 quedó intacta.** Su texto no cambió ni un byte, conserva su alcance
original —«lanzamiento controlado de Trazaloop CPR»— y sigue siendo inmutable:
se intentó reescribirla con el cliente administrativo y **la base lo rechazó**.
Es lo que hace que la historia signifique algo: 153 personas aceptaron ESE texto.

**Las quince viajaron enteras.** Al copiar un borrador a una revisión se puede
quedar atrás la salvedad, que es la mitad que hace verdadera una afirmación. Se
comprobó una a una: las tres con salvedad la llevan escrita, las dos con fuente
externa conservan su URL y su fecha de consulta, y las quince conservan su
procedencia.

**El metadato editorial no se publicó.** La vista pública no expone
`verification_status`, ni `source_basis`, ni `verification_note`, ni la fuente
externa. Se comprobó columna por columna, y también abriendo la página.

**La categoría aparece porque tiene contenido.** No se nombró en ningún sitio del
código: `v_faq_public_categories` la ofrece porque hay respuestas publicadas y
visibles debajo. Se comprobó además que **ninguna** categoría se ofrece vacía.

---

## 5 · Lo que NO se hizo

- No se publicó nada en Producción, que sigue en la migración **0111**.
- No se desplegó a Producción.
- No se creó ni una aceptación a mano para nadie.
- No se movió ni una aceptación antigua a la versión nueva.
- No se tocó el paquete jurídico v1.0.
- No se restableció ninguna credencial.
- No se tocó nada comercial: planes, límites, cuotas ni precios.
