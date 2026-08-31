# PE-03A · La bienvenida, y lo que cada persona recuerda

Un vídeo que se muestra al entrar es lo más fácil de convertir en una molestia.
Casi todo lo que sigue trata de que no lo sea.

---

## PET-28 · Cuándo aparece

Leído del código, el camino real desde el inicio de sesión es:

```
/login
  → requireSession()            sin sesión → /login
  → requireLegalAcceptance()    sin aceptar lo vigente → /legal/accept
  → getActiveOrganization()     sin empresa → /select-org
  → /modules                    LA PUERTA
```

**La bienvenida aparece en `/modules`, y en ningún otro sitio antes.**

`/modules` es la primera superficie normal: ya se pasaron las tres puertas
obligatorias. Ponerla antes tendría consecuencias concretas, no teóricas:

- **sobre `/legal/accept`** taparía un consentimiento legal, y estorbar una
  aceptación es lo más grave que puede hacer un vídeo promocional;
- **sobre `/select-org`** taparía una elección obligatoria;
- **sobre `/login`** no tiene sentido: aún no se sabe quién es.

Y por construcción no puede colarse antes: `/modules` corre después de los tres
guardianes, así que la bienvenida hereda ese orden en vez de tener que
respetarlo por su cuenta.

**Regla, escrita para que se pueda probar:** la bienvenida nunca se pinta en una
pantalla que exista para desbloquear una puerta obligatoria.

---

## PET-29 · A quién se le muestra

**No en cada inicio de sesión.** Eso convierte una bienvenida en un peaje.

| | |
|---|---|
| Nunca la ha visto | **se muestra** |
| La cerró en esta sesión | no se repite en esta sesión |
| Marcó «No volver a mostrar» | **nunca más** |
| Vuelve mañana tras cerrarla ayer | **se muestra** — cerrar es «ahora no» |

Dos gestos que significan cosas distintas, y por eso son dos botones:

- **Cerrar** — «ahora no». Vale para la sesión.
- **No volver a mostrar** — «nunca». Vale para siempre.

Confundirlos es el error habitual: si cerrar fuera para siempre, quien la cierra
por prisa la pierde; si «no volver a mostrar» fuera por sesión, no significaría
nada.

---

## PET-30 · Dónde vive la preferencia

**No hay ninguna tabla de preferencias en la plataforma.** `profiles` tiene siete
columnas y ninguna es una preferencia; lo más parecido,
`user_legal_acceptances`, es una constancia, no un gusto.

Así que PE-03 crea la primera. Y la decisión es **no** poner un booleano
`welcome_dismissed` en `profiles`.

| | Columna en `profiles` | Tabla de preferencias |
|---|---|---|
| Coste hoy | menor | una tabla más |
| La segunda preferencia | otra columna | una fila |
| La décima | diez columnas | diez filas |
| Semántica | mezcla identidad con gusto | separadas |

`profiles` es quién eres. Una preferencia es qué prefieres. La segunda
preferencia llega siempre —tema, idioma, avisos—, y entonces la columna se
convierte en el sistema de preferencias que nadie diseñó.

**`user_preferences`**, con clave y valor por persona, o un puñado de columnas
nombradas si se prefiere ser explícito. Lo que importa es que sea **por persona**,
no por empresa, ni por navegador, ni por sesión, ni por módulo.

**Por persona** porque la misma persona en dos empresas no quiere ver la
bienvenida dos veces, y porque cambiar de portátil no debería resucitarla. Eso
descarta `localStorage`, que además se pierde al limpiar el navegador.

Su RLS es la más simple del repositorio: **cada quien lee y escribe la suya, y
ninguna otra.** Ni siquiera un administrador de empresa toca la de nadie.

---

## PET-31 · Publicar una versión nueva NO resucita la bienvenida

La pregunta del encargo §23, y la recomendación es la **opción A**: *nunca más
significa nunca más*.

**Recomendado:** «No volver a mostrar» suprime la **experiencia de bienvenida**,
no una versión concreta. Publicar la v2 no se la muestra a quien dijo que no.

Tres razones, y la tercera es la que decide:

1. **Es lo que la frase dice.** Quien marca «No volver a mostrar» no está diciendo
   «no me muestres esta edición»; está diciendo que no quiere el vídeo. Reaparecer
   con una versión nueva es cumplir la letra y traicionar el sentido.
2. **La preferencia no se puede volver a dar.** Quien la marcó no encuentra dónde
   desmarcarla si el vídeo ya no aparece. Que reaparezca solo es, desde su lado,
   un ajuste que no se respetó.
3. **El coste de equivocarse es asimétrico.** Si no se muestra la v2 a quien dijo
   que no, alguien se pierde un vídeo — y sigue teniendo la FAQ, la ayuda y los
   tutoriales de pantalla, que es donde de verdad se aprende. Si se muestra, la
   plataforma le pasa por encima a una preferencia explícita, y eso se recuerda
   más que un vídeo.

**Y la puerta queda abierta sin construirla:** el modelo guarda *qué* se suprimió,
no solo *que* se suprimió. Si algún día se decide lo contrario para un cambio
mayor, el dato está y es una consulta distinta, no una migración.

**Regla, escrita para que se pueda probar:** publicar una versión de bienvenida
**nunca** modifica ni una fila de preferencias de nadie. Ni una.

Lo que sí puede haber, si se quiere, es una entrada voluntaria —«ver el vídeo de
bienvenida» desde Ayuda— para quien lo suprimió y luego quiere verlo. Eso es
elección de la persona, no reaparición.

---

## PET-32 · Cómo se ve

Un diálogo accesible sobre `/modules`, no una pantalla completa.

**Lo que tiene:**

- el reproductor con los controles del navegador;
- **Cerrar**, alcanzable con `Esc` y con el ratón;
- **No volver a mostrar**, como acción secundaria y explícita;
- foco atrapado dentro mientras está abierto, y devuelto al cerrarlo;
- título y descripción de la versión vigente.

**Lo que no tiene:**

- **reproducción automática**, y menos con sonido. Un vídeo que arranca solo con
  voz en una oficina es una razón para cerrar la sesión, no para verlo. Se pinta
  el cartel y un botón grande de reproducir;
- pantalla completa forzada;
- ninguna forma de quedarse encerrado: el diálogo se cierra siempre.

**Si no hay ninguna versión de bienvenida publicada, no aparece nada.** Ni un
hueco, ni un aviso. La ausencia de bienvenida no es un error que haya que
explicarle a nadie: es que no hay bienvenida.

---

## PET-33 · La bienvenida no se manda a nadie

No cuenta cuántas veces se vio, ni si se terminó, ni cuánto duró la sesión de
vídeo. Lo único que se guarda de una persona es **si dijo que no quiere verla**,
que es lo mínimo necesario para respetarlo.

---

## PET-34 · No hay que producir el vídeo para cerrar PE-03

La arquitectura permite subirlo y cambiarlo **sin desplegar**, que es todo lo que
PE-03 tiene que garantizar. Que exista un vídeo es trabajo editorial, y puede
llegar después.

Y el contenido, cuando llegue, no lo escribe esta arquitectura. Si sirve de guía:
qué es Trazaloop, que Quality es el módulo principal, que los especializados
existen, y dónde está la ayuda. Cuatro cosas y menos de tres minutos.

**No se genera el vídeo, ni su guion, ni su transcripción.**
