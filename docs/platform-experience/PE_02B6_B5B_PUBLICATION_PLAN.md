# PE-02B6 · La puerta de B5B

> **Ejecutado el 31 de agosto de 2026.** La dirección aprobó, y B5B publicó en
> Staging la política v1.1 y las quince respuestas. Lo que sigue se conserva
> como el plan que se siguió; lo que ocurrió al seguirlo está en
> [`PE_02B5B_PUBLICATION.md`](PE_02B5B_PUBLICATION.md).

**B5B no se ejecuta hasta que una persona apruebe el contenido.** Este documento
dice qué abre la puerta, qué se hace al cruzarla y en qué orden.

---

## 1 · Qué abre la puerta

Tres respuestas del documento de revisión, y ninguna la puede dar el repositorio:

1. **¿Se publica la política de privacidad v1.1?**
2. **¿Se publican las quince respuestas de seguridad, o solo algunas?**
3. **¿Cuál es el proveedor de IA en producción?** — solo condiciona si la FAQ
   puede nombrarlo; no bloquea publicar.

Sin la 1 y la 2 por escrito, B5B no empieza.

---

## 2 · El orden, y por qué es ese

### Paso 1 · Publicar la política de privacidad

`/platform/legal` → v1.1-draft → publicar, con la confirmación explícita.

Va **primero** porque las respuestas de seguridad hablan del tratamiento de datos
y de la IA. Publicarlas mientras la política vigente es la preliminar de CPR
dejaría dos textos públicos que no coinciden — que es exactamente el bloqueo
editorial que PE-02A identificó.

**Qué ocurre al publicar:** la v1 se archiva con su fecha de retiro, la v1.1
queda vigente, y como la aceptación referencia el **id** del documento, a todo el
mundo se le vuelve a pedir aceptar. No hay que programar nada: es consecuencia de
suceder en vez de reescribir.

### Paso 2 · Comprobar la reaceptación

Ver §3.

### Paso 3 · Publicar las respuestas de seguridad aprobadas

`/platform/faq` → una a una, con su nota de cambio.

Las quince están en `verified` o `verified_with_qualifier`, así que la barrera de
0155 las dejará pasar. **Las dos con salvedad la llevan escrita**; si alguien la
borrara al editar, la base rechazaría publicarlas.

### Paso 4 · Comprobar que la categoría aparece

Al publicar la primera pública, **Seguridad y privacidad** empieza a ofrecerse en
`/faq`: las categorías sin contenido no se muestran. Diez son públicas y cinco
exigen sesión, así que un visitante verá menos que alguien dentro.

### Paso 5 · Humo humano final de PE-02

El recorrido del documento de revisión, ya con todo publicado.

---

## 3 · El plan de reaceptación

Publicar una política legal es la operación más difícil de deshacer de la
consola: **no hay «despublicar»**. Volver al texto anterior también sería
publicar una versión.

### Antes de publicar

1. **Saber a quién afecta.** A todas las cuentas con aceptación registrada del
   documento `privacy`. En Staging son cuentas de QA; en Producción, cuando
   llegue, serían personas reales.
2. **Comprobar la puerta.** `requireLegalAcceptance` redirige a `/legal/accept`
   a quien no tenga aceptados los activos requeridos. Está probado en
   `pe02b2-legal` AC y no ha cambiado.
3. **Saber cómo se acepta.** Entrando con cada cuenta a `/legal/accept` y
   marcando las dos casillas. No hay atajo, y no debe haberlo.
4. **Verificar que las aceptaciones anteriores se conservan.** Quedan atadas al
   id y a la versión que se aceptó; la v1 archivada conserva las suyas. Probado
   en `pe02b2-legal` V y W.

### Lo que NO se hace

- **No se tocan las aceptaciones existentes.** Son consentimiento real: ni se
  migran, ni se reinterpretan, ni se heredan.
- **No se publica en Producción.** Producción sigue en 0111 y ni siquiera tiene
  las tablas de la FAQ ni de la ayuda. Publicar allí es una decisión posterior y
  distinta, que empieza por aplicar 47 migraciones.

### Orden dentro del paso

```
1 · anotar qué cuentas de QA tienen aceptación de privacy v1
2 · publicar v1.1 desde la consola, con confirmación
3 · comprobar que v1 quedó archivada con fecha de retiro y su sucesora enlazada
4 · entrar con una cuenta de QA → debe redirigir a /legal/accept
5 · aceptar, y comprobar que la aceptación nueva apunta a v1.1
6 · comprobar que la aceptación de v1 sigue registrada
```

---

## 4 · Lo que B5B NO debe hacer

- Publicar en Producción.
- Tocar el resto del paquete jurídico sin decisión explícita.
- Publicar una respuesta a la que se le haya quitado la salvedad.
- Nombrar al proveedor de IA sin la confirmación 3.
- Restablecer credenciales por su cuenta: si hace falta acceso, lo restablece una
  persona por la vía autorizada.

---

## 5 · Si algo sale mal

**Una respuesta publicada con un error de redacción:** se corrige el borrador y
se publica otra vez. La anterior queda en la historia con su periodo de vigencia.

**Una respuesta que no debía publicarse:** se retira. Deja de verse y no se borra
nada.

**La política publicada con un error:** no se puede despublicar. Se corrige
redactando una **v1.2** y publicándola — y a todo el mundo se le vuelve a pedir
aceptar otra vez. Por eso el paso 1 va después de la revisión y no antes.

---

## 6 · Estado de la puerta

| | |
|---|---|
| Contenido preparado | **sí** |
| Confirmaciones técnicas | **resueltas** |
| Confirmaciones de la dirección sobre IA | **resueltas** (2026-08-31) |
| Aprobación editorial del contenido | **recibida** · 2026-08-31 |
| Proveedor de IA | **verificado** · OpenAI en el entorno desplegado; ninguno en Producción |
| Revisión jurídica de la sección 18 | **PENDIENTE** |
| **B5B puede empezar** | **sí** · empezó y terminó el 2026-08-31 |
