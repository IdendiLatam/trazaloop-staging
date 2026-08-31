# PE-01B · Validación humana de la puerta

Lo automatizado ya está en verde: 97 comprobaciones, la matriz A–P y los ocho
recorridos por HTTP. **Lo que ninguna prueba puede decidir es si la puerta se
siente bien.** Esto es lo que hay que mirar con los ojos.

Cada punto lleva **qué hacer**, **qué debería pasar** y **qué sería un fallo**.

---

## 0 · Antes de empezar

Hace falta una cuenta con una empresa que tenga **Quality activo**. Si además se
puede probar con una empresa sin módulos y con otra con la prueba de PCR
vencida, mejor: son los dos casos donde la aplicación más fácilmente ofende.

---

## 1 · El aterrizaje

**Qué hacer:** iniciar sesión.

**Qué debería pasar:** aterrizar en `/modules`, siempre — aunque la empresa
tenga un solo módulo. La pantalla debe leerse como **la entrada a Trazaloop**,
no como un trámite intermedio.

**Sería un fallo:** un parpadeo de la puerta antes de caer dentro de un módulo;
que se note un desvío; que la pantalla parezca un menú técnico.

**Pregunta honesta:** ¿esta pantalla parece de alguien, o parece de nadie?

---

## 2 · La jerarquía

**Qué hacer:** mirar la puerta tres segundos y apartar la vista.

**Qué debería pasar:** que lo que quede en la cabeza sea **Quality**. Es el
protagonista y tiene que ganar sin discusión: más grande, primero, con más aire.
Los otros tres se leen después, como opciones.

**Sería un fallo:** tener que buscar cuál es el importante; que las cuatro
tarjetas pesen igual; que Quality se pierda entre módulos que la empresa ni
tiene.

---

## 3 · La frase de Quality

**Qué hacer:** leerla entera, en voz alta.

> Gestiona procesos, riesgos, objetivos, personas, proveedores, auditorías y
> mejora continua desde un entorno conectado y trazable.

**Qué debería pasar:** que suene a lo que el módulo hace, y que no prometa nada
que no cumpla.

**Sería un fallo:** que en cualquier sitio de la pantalla aparezca «certifica»,
«conformidad ISO» o cualquier promesa de cumplimiento. Está comprobado
automáticamente, pero conviene mirarlo.

---

## 4 · Lo que no se tiene

**Qué hacer:** buscar un módulo que la empresa **no** tenga e intentar pulsarlo.

**Qué debería pasar:** que no pase nada. Se ve, dice en qué situación está, y no
se puede pulsar. **No** hay «Ver planes», ni precio, ni «hablar con ventas», ni
nada que empuje a comprar.

**Sería un fallo:** un enlace que lleva a un sitio donde te vuelven a decir que
no; un botón gris que parece pulsable; cualquier insinuación comercial.

**Pregunta honesta:** ver lo que no tengo, ¿me informa o me hace sentir que me
falta algo?

---

## 5 · Entrar y volver

**Qué hacer:** entrar a Quality. Mirar la cabecera. Volver con «Ver módulos».
Entrar otra vez. Volver otra vez.

**Qué debería pasar:** dentro se sabe **en qué módulo se está** y hay una salida
clara a la puerta. Al volver, la puerta abre — no te reenvía dentro.

**Sería un fallo:** perder de vista en qué módulo estás; que volver rebote; que
la aplicación «recuerde» el módulo y te salte la puerta.

---

## 6 · La prueba que vence

**Qué hacer:** con una empresa cuya prueba de PCR haya vencido y Quality siga
activo, abrir la puerta y después entrar a Quality.

**Qué debería pasar:** el aviso está **en la puerta**, nombra solo PCR, y dice
que los datos se conservan. Dentro de Quality **no hay ninguna banda**: lo de
PCR no es asunto de Quality.

**Sería un fallo:** un aviso de vencimiento persiguiéndote dentro de un módulo
que no ha vencido; un texto que sugiera que se pierden datos.

---

## 7 · Una empresa sin módulos

**Qué hacer:** abrir la puerta con una empresa sin ningún módulo activo.
Recargar dos o tres veces.

**Qué debería pasar:** te quedas ahí. Se explica que la empresa no tiene módulos
activos, que **tu cuenta funciona y tus datos se conservan**, y se ve el catálogo
con el estado de cada módulo.

**Sería un fallo:** un rebote; un error rojo; un mensaje que insinúe que tu
cuenta está mal; una oferta comercial de circunstancias.

**Pregunta honesta:** si yo fuera esa persona, ¿entendería qué me pasa y qué
hacer?

---

## 8 · Cuando algo se rompe de verdad

**Qué hacer:** esto no se puede forzar cómodamente a mano, así que basta con
**leer** el texto que se muestra cuando el acceso no se puede comprobar:

> No se pudo verificar · No fue posible verificar el acceso a los módulos. Es un
> problema temporal al consultar tu acceso, no un cambio en lo que tienes
> contratado. Vuelve a intentarlo en unos minutos.

**Qué debería pasar:** que **no afirme nada** sobre lo contratado. Es el defecto
PE-D1 y es la razón principal de este tramo.

**Sería un fallo:** cualquier variante de «no tienes este módulo» construida a
partir de una avería.

---

## 9 · En el teléfono

**Qué hacer:** abrir la puerta en un móvil real, o estrechar la ventana al
máximo.

**Qué debería pasar:** una sola columna, Quality primero, y **nada que obligue a
desplazarse en horizontal**.

**Sería un fallo:** tener que arrastrar hacia el lado; que el protagonista quede
por debajo de los especializados.

---

## 10 · Cambiar de empresa

**Qué hacer:** con dos empresas, cambiar de una a otra desde la puerta.

**Qué debería pasar:** vuelves a la puerta y **lo que se ve es lo de la nueva
empresa**. La puerta dice de qué empresa está hablando.

**Sería un fallo:** ver módulos de la empresa anterior; un 404; acabar dentro de
PCR.

---

## 11 · Lo que se sabe que sigue mal, y no se tocó aquí

- La consola de Superadministrador sigue enseñando «Plan Demo / 0 MB / 50 MB»
  como estado comercial. Es deuda conocida y arreglarla en silencio dentro de
  este tramo la habría escondido.

---

## 12 · Cómo devolver el resultado

Por cada punto: **bien** / **mal** / **dudoso**, y si es mal o dudoso, qué
esperabas ver. Lo dudoso vale tanto como lo roto: si algo requiere pensar dos
veces, la puerta todavía no está terminada.
