# PE-03B1 · Ver el vídeo

---

## 1 · Solo lo vigente, por dos caminos

**Uno · la vista no mira las otras.** `v_tutorial_current` devuelve la versión
con vigencia abierta de un tutorial activo, y nada más. Una candidata o una
histórica no salen porque la consulta no las busca.

Sin `security_invoker`, a propósito, y por la misma razón que 0141: quien
consume un tutorial no pertenece a la plataforma, así que las políticas de las
tablas le devolverían cero filas. El filtro está dentro de la vista, y es que
exista sesión.

**Y no expone la ruta del objeto.** Si la ruta viajara al navegador, la frontera
dejaría de estar donde se autoriza y pasaría a estar donde se adivina.

**Dos · la ruta sale por una sola puerta.** `tutorial_current_object_path`
devuelve la ruta de una versión **solo si es la vigente de su tutorial activo**.
Para una candidata o una histórica devuelve `NULL` — no una excepción: pedir lo
que no toca no es un error del sistema, es algo que no se atiende.

No acepta «dame la ruta de esta versión» sin más. Sin esa comprobación, el
identificador de una versión histórica sería una llave.

**Y una tercera, en el almacenamiento.** La política del cubo deja firmar solo
objetos que son la versión vigente de un tutorial activo. Tres barreras
independientes: un error en una no abre las otras.

---

## 2 · Se firma con la sesión de quien mira

Sin cliente administrativo. La política de Storage lo permite porque el objeto
es el vigente, y ahí es la RLS la que decide — no un privilegio del servidor.

Comprobado: una persona normal firma la vigente y **no** puede firmar la
histórica, ni la candidata, ni nada tras retirar el tutorial.

---

## 3 · Se puede adelantar

Es lo que hace usable un tutorial de cuatro minutos, y es lo que una
comprobación perezosa no demuestra.

**Cómo NO se comprueba:** pidiendo la URL firmada y viendo que devuelve 200. Eso
demuestra que el objeto existe.

**Cómo se comprueba:** pidiendo `Range: bytes=102400-153599` y verificando las
tres cosas:

| | |
|---|---|
| Estado | **206 Partial Content** |
| `content-range` | `bytes 102400-153599/262144` |
| Los bytes | **los de ese tramo**, comparados posición a posición |

La tercera es la que importa. Sin ella, un servidor que devolviera siempre el
principio del archivo con el tamaño correcto pasaría la prueba, y adelantar
mostraría el minuto cero.

Se comprobó **en local y en Staging alojado**, y por el flujo real: reserva,
subida por URL firmada, verificación, publicación y rango.

---

## 4 · Se reproduce, no se descarga

`Content-Type: video/mp4` y **sin `Content-Disposition`**, así que el navegador
lo reproduce en línea en lugar de ofrecer un archivo.

---

## 5 · El plazo de la firma: dos horas, con evidencia

PE-03A lo recomendó midiendo en local y dejó el número por confirmar contra el
alojado. **Confirmado.**

La caducidad es **absoluta**, no deslizante, y se aplica: una URL de un segundo
devuelve 400 a los 2,5. El navegador conserva la misma URL toda la sesión del
`<video>`, así que el plazo tiene que cubrir la **sesión**, no la duración del
vídeo: quien lo deja abierto y vuelve, al adelantar pide otro rango con la misma
URL.

Dos horas cubren eso de sobra y siguen siendo un enlace que muere el mismo día.

Firmar cuesta unos 18 ms, así que **se firma al abrir el reproductor, no al
pintar la página**: una pantalla con el botón no gasta nada. Es una consulta y
una firma por vídeo abierto, no una por pantalla ni una por versión.

---

## 6 · Lo que la firma NO protege, dicho

Una URL firmada **autoriza el objeto por sí misma**. Después de emitirla, la
política del cubo ya no interviene: quien tenga la URL puede reproducir el vídeo
hasta que caduque, tenga sesión o no.

Eso no es un defecto: es cómo funciona una URL firmada, y es la razón de que el
plazo importe. Pero decir «la RLS protege la reproducción» sería inexacto. Lo
que la protege es:

- que el servidor solo firma la versión vigente;
- que solo firma para quien tiene sesión;
- que la firma caduca.

---

## 7 · Sin sesión, nada

- La vista del producto no devuelve nada.
- La función de ruta devuelve `NULL`.
- Firmar falla.
- El objeto sin firma devuelve 400.
- El cubo no se puede listar.

---

## 8 · Y ver un tutorial no consulta ningún plan

La decisión congelada §32 dice que el tutorial no se cobra. La forma de
garantizar que nadie se olvida de comprobar el plan es **que no se comprueba**:
no hay ni una mención a modos de acceso, planes o derechos en el camino de
lectura.

Hay una comprobación que lee `lib/db/tutorials.ts` y falla si aparece alguna.

Lo que sí sigue aplicando es el **acceso al módulo**: quien no entra a Textiles
tampoco ve sus pantallas. Pero eso lo decide la puerta del módulo, no el
tutorial.
