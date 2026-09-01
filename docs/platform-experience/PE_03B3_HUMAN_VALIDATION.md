# PE-03B3 · Lo que hay que mirar con los ojos

Lo que sigue no se puede automatizar: que un vídeo se vea bien, que una frase se
entienda, y que entrar con la cuenta de siempre funcione.

**Dónde:** el despliegue de Preview.
**Con qué cuenta:** `idendilatam@gmail.com`, con **la contraseña de siempre**.
Nadie la cambió — ver [el traspaso](PE_03B3_SUPERADMIN_HANDOVER.md).

---

## 1 · Entrar

1. Abrir el Preview y entrar con `idendilatam@gmail.com`.
2. Comprobar que la barra superior muestra **Ayuda** y **Ver video tutorial**.
3. Ir a `/platform/tutorials`. La consola de tutoriales tiene que estar
   accesible: es la señal de que el papel de superadministrador quedó bien
   puesto.

> Si la contraseña no funciona, **no hay que pedir que nadie la cambie por
> detrás**. El camino es la recuperación desde la propia pantalla de acceso.

Mientras esto no esté confirmado, `qa-a@trazaloop-staging.local` **sigue
activo**. Es la puerta de repuesto, y se cierra después, no antes.

---

## 2 · El botón, en una pantalla con tutorial

En Staging hay tutoriales publicados de las pruebas anteriores. Elegir una de
las once pantallas registradas —por ejemplo `/quality/processes`— y:

| Qué mirar | Qué tiene que pasar |
|---|---|
| El botón | Se lee **«Ver video tutorial»**, junto a «Ayuda» |
| Al pulsarlo | Se abre un diálogo con el título del tutorial |
| El vídeo | **No arranca solo.** Empieza cuando se le da al play |
| Los controles | Play, pausa, barra, volumen, pantalla completa |
| Adelantar | Arrastrar la barra a la mitad funciona sin cortes |
| Cerrar | El botón «Cerrar», la tecla **Escape**, y pinchar fuera |
| Al cerrar | El foco vuelve al botón «Ver video tutorial» |

Con teclado, sin ratón: `Tab` hasta el botón, `Enter`, y comprobar que el foco
se queda **dentro** del diálogo dando vueltas, y que Escape cierra.

---

## 3 · El botón, en una pantalla sin tutorial

En una de las once pantallas registradas que todavía **no** tenga vídeo
publicado:

- El botón **sí aparece**.
- Al pulsarlo, el diálogo dice la frase congelada de PE-03A y **no** pinta un
  reproductor vacío.
- La frase no debe sonar a avería. Dice que todavía no hay vídeo, no que algo
  falló.

Y en una pantalla **fuera** del registro —`/quality/audits`, por ejemplo—: el
botón **no aparece en absoluto**. Ni apagado ni en gris.

---

## 4 · Navegar con el diálogo abierto

1. Abrir el tutorial de una pantalla.
2. Sin cerrarlo, usar el menú lateral para ir a otra pantalla.
3. El diálogo tiene que **cerrarse solo**.

Es el fallo que se evita a propósito: quedarse viendo el tutorial de la pantalla
anterior encima de la nueva.

---

## 5 · Subir un vídeo grande

Esto es lo que ninguna prueba automática cubre, y es el corazón del tramo.

1. En `/platform/tutorials`, entrar en un tutorial y subir un vídeo **de más de
   200 MB**. Uno de un giga es mejor todavía.
2. Mirar la barra de progreso: tiene que avanzar por trozos, con su porcentaje y
   sus megas.
3. **Que termine.** El estado final dice «Listo para revisar», **no
   «Publicado»** — subir no es publicar.
4. Publicarlo desde la ficha.
5. Volver a la pantalla de producto y verlo.

| Qué mirar | Por qué |
|---|---|
| El texto bajo el selector de archivo | Dice que Trazaloop no pone límite y que la carga depende del servicio. **No** dice «ilimitado» |
| Ningún mensaje de tamaño máximo | Si aparece un número de megas, algo reintrodujo el tope |
| Un vídeo largo | Que no haya ningún aviso de duración: no hay máximo |

### Y la prueba que de verdad importa

Poner un vídeo **de más de dos horas**, o dejar uno reproduciéndose más de dos
horas, y comprobar que **no se corta**. La URL firmada dura dos horas y se
renueva sola por debajo; si algo falla ahí, se ve como un vídeo que se para de
golpe sin motivo.

Si no hay tiempo para dos horas, vale una comprobación indirecta: dejar el
diálogo abierto un rato largo con el vídeo en pausa, volver, y comprobar que
sigue reproduciendo desde donde estaba.

---

## 6 · Lo que NO hay que encontrar

- Ningún mensaje con una ruta de archivo, un identificador de versión o un
  código de error del almacenamiento.
- Ningún «Próximamente».
- Ningún vídeo que arranque solo.
- Ningún tutorial de una pantalla apareciendo en otra. Especialmente: el
  listado de procesos y la ficha de un proceso tienen tutoriales **distintos**.

---

## 7 · Después de confirmar

Cuando esto esté visto y funcione:

- Se puede revocar `qa-a@trazaloop-staging.local`. **No antes.**
- PE-03B4 puede empezar: la ventana de bienvenida y la preferencia por persona.

Producción no entra en esta validación. Sigue en la migración 0111, sin cubo de
tutoriales y sin desplegar.
