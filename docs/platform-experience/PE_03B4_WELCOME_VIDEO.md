# PE-03B4 · El vídeo de bienvenida

El motor ya existía. PE-03B1 creó la identidad `welcome` —única, sin pantalla y
sin módulo— y PE-03B2 la consola con la que se sube, se previsualiza, se
publica, se versiona y se repone. Lo que faltaba era **cuándo se ve**.

No se creó ningún motor nuevo.

---

## 1 · Dónde aparece, y por qué solo ahí

En la puerta —`/modules`—, que es la primera pantalla normal después de entrar.

Y en ninguna otra. Un modal de bienvenida montado en el layout del shell
reaparecería en cada una de las 147 pantallas al navegar, que es la forma de
convertir un saludo en una molestia.

---

## 2 · Las puertas obligatorias van antes, y esto no las toca

```
entrar
  → aceptación legal            requireLegalAcceptance("/modules")
  → empresa activa              activeOrg
  → la puerta de módulos
      → bienvenida, si procede
```

Un vídeo encima de un texto legal que hay que aceptar **compite con el texto**.
Encima del selector de empresa **esconde el único paso que quedaba**.

`/modules` ya exigía sesión y aceptación legal antes de pintar nada; la
bienvenida se monta además solo si hay empresa activa. Una prueba comprueba el
orden comparando posiciones en el fichero, no leyéndolo a ojo: si alguien
moviera la bienvenida por encima de la aceptación legal, la suite lo diría.

---

## 3 · Cuándo se muestra

Las cinco condiciones, todas:

- hay sesión;
- las puertas obligatorias están pasadas;
- **hay un vídeo de bienvenida publicado**;
- la persona **no** ha pedido no volver a verlo;
- no se ha cerrado ya **en esta sesión**.

Si falta cualquiera, no se abre nada.

---

## 4 · Las dos formas de cerrarlo no significan lo mismo

| | Qué hace | Dónde se guarda |
|---|---|---|
| **Cerrar** | Por ahora. Puede volver a salir en otra sesión. | Cookie de sesión |
| **No volver a mostrar** | Nunca más, aunque se publique otra versión. | `user_preferences` |

### «Cerrar» no escribe en la base

Convertir «ahora no» en «nunca» sería responder por la persona. Se recuerda en
una **cookie de sesión** —sin `max-age` ni `expires`, así que muere al cerrar el
navegador— marcada con el identificador de quien la puso, para que la decisión
de quien usó antes ese ordenador no se aplique a quien entra después.

Se usa una cookie y no `sessionStorage` porque `sessionStorage` es **por
pestaña**: abrir una segunda pestaña habría vuelto a enseñar el vídeo dentro de
la misma sesión.

La cookie se lee dentro de un efecto y no al pintar: leerla durante el render
daría un resultado distinto en el servidor y en el navegador.

### «No volver a mostrar» es definitivo

Se guarda en `user_preferences`, por persona. Publicar la v2, la v3 o la v4 **no
lo reinicia**: la preferencia no guarda ninguna referencia a la versión del
vídeo, y una prueba lo demuestra publicando una versión nueva de verdad y
comprobando que sigue sin salir.

Y no hay reinicio masivo. 0161 no tiene política de DELETE — ver
[PE_03B4_USER_PREFERENCES.md](PE_03B4_USER_PREFERENCES.md).

La copia lo dice sin suavizarlo: *«Si eliges no volver a mostrarlo, no aparecerá
más — tampoco cuando se publique una versión nueva.»* Prometer que se puede
recuperar sería mentir.

---

## 5 · Sin vídeo publicado, no pasa nada

No se abre ningún diálogo. Y **no** se usa la copia de «tutorial en
actualización»: esa es la de los tutoriales de pantalla, donde alguien pulsó un
botón y merece una respuesta. Aquí nadie pulsó nada.

---

## 6 · Y si algo falla, tampoco

La bienvenida **no tiene estado de avería**, a diferencia del tutorial de
pantalla, que distingue tres. Es deliberado.

Allí hay un botón que alguien pulsó: una avería tiene que decirse, o la persona
cree que esa pantalla no tiene vídeo y no vuelve a intentarlo. Aquí no hay
botón. Si no hay vídeo, si no se pudo firmar o si no se pudo leer la
preferencia, la respuesta es la misma: no se abre nada y se sigue trabajando.

**La bienvenida es acompañamiento, no una puerta.** Fallar aquí no puede impedir
entrar a Trazaloop.

---

## 7 · El reproductor es el mismo, no otro

PE-03B3 escribió el diálogo del tutorial de pantalla: trampa de foco, Escape,
vuelta del foco al cerrar, `<video>` nativo sin reproducción automática, y
renovación de la URL firmada conservando el segundo.

La bienvenida necesita exactamente eso. Copiarlo habría dado dos reproductores
que se parecen hasta que uno de los dos se arregla.

Así que lo de B3 salió a `components/domain/tutorials/tutorial-player.tsx` sin
cambiar de comportamiento, y **los dos sitios lo usan**. Una prueba comprueba
que ninguno de los dos escribe su propio `<video>`.

De ahí se hereda todo lo demás:

- **sin reproducción automática** — que sea lo primero que uno ve no lo
  convierte en algo que deba sonar sin permiso;
- **sin duración máxima**, y la renovación funciona igual, así que un vídeo de
  bienvenida largo no se corta a las dos horas;
- diálogo accesible, Escape, foco devuelto, y usable en móvil.

---

## 8 · Ni un plan por el camino

Ver la bienvenida no consulta `organization_modules`, ni `access_mode`, ni
ninguna tabla comercial. Igual que el tutorial de pantalla en PE-03B3, y por la
misma razón: la forma de garantizar que nadie se olvida de comprobar el plan es
que no hay nada que comprobar.
