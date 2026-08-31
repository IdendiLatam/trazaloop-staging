# PE-02B6 · Todo PE-02, en una sola sesión de revisión

PE-02 está **técnicamente terminado**. Lo que falta es una decisión editorial, y
está reunida aquí para que se pueda tomar de una vez en lugar de en cinco ratos.

**Calcula una hora.** Los puntos A–D son de uso; los E–H son de texto y son los
que de verdad hay que leer despacio.

> **Esta guía supone que se puede entrar a la consola de Staging.** Si no se
> puede, [`PE_02B6_1_HUMAN_EDITORIAL_REVIEW.md`](PE_02B6_1_HUMAN_EDITORIAL_REVIEW.md)
> trae el texto exacto de todo lo que hay que revisar y una hoja de decisión, sin
> necesidad de entrar a ninguna pantalla. Los puntos A y B —cómo se sienten las
> consolas— siguen exigiendo la consola; el resto no.

---

## Antes de empezar

Todo se revisa en el **Preview**, con la cuenta de superadministrador de Staging
(`qa-a@trazaloop-staging.local`). Si su contraseña no está disponible, hay que
restablecerla por la vía autorizada de Supabase Auth del proyecto de Staging —
este repositorio no guarda credenciales y no las va a guardar.

**Regla de la sesión: no pulsar publicar en nada.** Publicar la política activa
la sucesora y a todo el mundo se le vuelve a pedir aceptar. Eso es B5B, y solo
después de esta revisión.

---

## A · La consola de preguntas frecuentes

`/platform/faq`

- ¿Distingues lo publicado del borrador sin pensarlo?
- ¿La vista previa te deja claro que no publica nada?
- ¿Publicar es evidente sin ser accidental?
- ¿La historia se entiende: qué decía, quién lo cambió, cuándo?

---

## B · La consola de ayuda contextual del producto

`/platform/help`

- ¿Entiendes que esto es la **ayuda contextual**: lo que sale al pulsar el botón
  «i» dentro de Trazaloop?
- Abre una de partes interesadas: ¿la vista previa se parece a lo que verá quien
  la lea?
- ¿Sabrías cambiar un texto y publicarlo? **Pruébalo** con una: cámbiala,
  publícala y compruébalo en Quality → Contexto → Partes interesadas. Esto sí se
  puede publicar: es ayuda de producto, no contenido legal.

---

## C · La política de privacidad v1.1

`/platform/legal` → **v1.1-draft**

**Lo que hay que saber antes de leerla:** no es nueva. Es el paquete jurídico que
aprobaste el 27 de julio —y que **nunca llegó a publicarse**: hoy la plataforma
sirve una versión preliminar que habla solo de CPR— con tres cosas añadidas:
Quality, Intelligence y el proveedor de IA entre los encargados.

**Lo que hay que leer despacio:** la **sección 18** entera y la **19**.

**Lo que hay que decidir:**
1. ¿La sección 18 dice de más o de menos?
2. ¿Se publica ya, sabiendo que obliga a todo el mundo a aceptar de nuevo?
3. ¿Se actualizan a la vez los otros cinco documentos del paquete? Cuatro
   tampoco mencionan Intelligence.
4. ¿Resend sigue en uso? Figura como encargado y no aparece en el código.

---

## D · Las quince respuestas de seguridad

`/platform/faq` → filtro **Categoría: Seguridad y privacidad**

Están todas en borrador y ninguna se ve en `/faq`. Lee al menos las cuatro de
abajo; las otras once son más mecánicas.

---

## E · Entrenamiento de modelos · «¿Mis datos se utilizan para entrenar modelos?»

Ahora dice **no**, con las dos mitades separadas: la política del proveedor —no
por defecto, salvo autorización expresa— y **nuestra decisión de no activarla**,
que es lo que confirmaste.

**Qué mirar:** que la distinción entre «lo que dice el proveedor» y «lo que
decidimos nosotros» se lea con claridad. Es lo que la hace creíble.

**Lo que no dice, a propósito:** que el proveedor no entrenará jamás bajo
ninguna circunstancia. Lo que dice su política es «salvo autorización», y esa
autorización es nuestra.

---

## F · Retención en el proveedor · «¿Cuánto tiempo puede conservar la información?»

Dice **hasta 30 días** con sus excepciones, y añade que **no tenemos retención
cero contratada**, así que ese plazo aplica.

**Qué mirar:** si decir abiertamente que no tenemos retención cero te parece que
resta o que suma. Nuestra posición es que suma: quien pregunta esto sabe que
existe, y callarlo sería lo que resta.

Y aclara que pedir que no se almacene **no es** retención cero — porque la propia
documentación del proveedor dice que son cosas distintas.

---

## G · Acceso del personal · «¿Puede el equipo de Trazaloop acceder a mis datos?»

La más delicada. Dice que en la operación normal no, explica qué sí ve el equipo,
y **admite** que administrar la infraestructura implica acceso a los sistemas y
que los respaldos contienen todo.

**Qué mirar:** si esa admisión te parece que resta. Cualquiera que sepa cómo
funciona la nube sabe que el absoluto sería mentira; decirlo primero es lo que
hace creíble el resto.

**Lo que no se puede quitar:** el párrafo de infraestructura. Hay una prueba que
falla si desaparece.

---

## H · «¿Cómo protege Trazaloop la información de mi empresa?»

La respuesta bandera. Ocho capas reales, y termina diciendo que ninguna medida
elimina el riesgo y que no tenemos certificaciones propias.

**Pregunta honesta:** ¿se la enviarías a un cliente que pregunta por seguridad?

---

## I · La FAQ que ve el cliente

`/faq`, sin sesión y con ella.

- ¿Se encuentra sin saberse la URL?
- ¿Encuentras una respuesta rápido?
- ¿Los temas tienen sentido? (Con sesión hay más, porque hay más que leer.)
- ¿Parece parte de Trazaloop o documentación pegada?

Verás que **Seguridad y privacidad no aparece**: es correcto, su contenido está
en borrador.

---

## J · La entrada «Ayuda»

Recorre unas cuantas pantallas: la puerta, Quality, PCR, Textiles, tu perfil, el
equipo.

- ¿Está siempre en el mismo sitio de la barra superior?
- ¿Te parece bien que se llame «Ayuda» y no «FAQ»? Se eligió así porque va a
  crecer con el tutorial de la pantalla y el soporte.

---

## Lo que hay que devolver

Por cada punto: **bien** / **cambiar** / **hablarlo**. Y tres respuestas que son
las que desbloquean B5B:

1. ¿Se publica la política de privacidad v1.1?
2. ¿Se publican las quince respuestas de seguridad, o solo algunas?
3. ¿Cuál es el proveedor de IA contratado en producción? (Es lo único que sigue
   sin poder confirmarse desde el repositorio, y solo afecta a si la FAQ puede
   nombrarlo.)
