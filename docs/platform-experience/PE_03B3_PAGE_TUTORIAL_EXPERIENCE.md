# PE-03B3 · El tutorial de una pantalla

El botón que faltaba. PE-03B1 puso los datos y el cubo, PE-03B2 la consola con
la que se suben y se publican los vídeos, y hasta aquí nadie los veía: un
tutorial publicado en Staging no tenía por dónde salir. Este tramo abre esa
puerta.

---

## 1 · Un botón, no ciento cuarenta y siete

PE-03A dejó medido lo que hacía falta saber antes de decidir dónde poner el
botón: **no existe un componente de cabecera compartido**. Cada una de las 147
pantallas del shell escribe la suya a mano. Poner el botón «donde va cada
título» significaba tocar 147 ficheros —y que la 148 naciera sin él, porque
nadie recuerda una lista de 147 cosas.

La barra superior sí es un sitio, y estaba reservado por escrito: cuando PE-02B4
puso el enlace «Ayuda» dejó dicho que «PE-03 sumará el tutorial de la pantalla
al mismo sitio». Eso es lo que se hizo.

```
app/(app)/(shell)/layout.tsx        →  Ayuda · Ver video tutorial
app/(app)/modules/page.tsx          →  Ayuda · Ver video tutorial
```

Dos ficheros, no 147. El segundo es la única excepción puesta a mano, y tiene
una razón: la puerta de módulos vive **fuera** del shell, así que el layout no
la alcanza. Se anota aquí porque una excepción sin explicación se convierte en
una costumbre.

El botón se llama **«Ver video tutorial»**, con esas palabras. No «Tutorial», no
un icono de reproducción suelto: quien no sabe que existe la función tiene que
poder leer qué le van a dar.

---

## 2 · La ruta dice dónde estamos; no dice qué tutorial es

Es la distinción que PE-02 congeló y que aquí vuelve a ser el centro.

El componente mira `usePathname()` para averiguar **en qué pantalla está**, y
consulta el registro de claves para saber **qué clave le corresponde**. La
identidad del tutorial sigue siendo la clave, no la dirección.

```
/quality/processes/8f2c-…   →  quality.processes.detail  →  tutorial
        ↑                              ↑
  dónde estamos hoy            quién es, para siempre
```

Si mañana esa pantalla se muda a otra dirección, se corrige su `route` en el
registro y **el tutorial no se entera**: misma clave, mismas versiones, misma
historia de publicación, mismas personas que ya lo vieron.

La resolución está en `resolvePageKeyForPath()` y la cobertura, en
[PE_03B3_PAGE_KEY_COVERAGE.md](PE_03B3_PAGE_KEY_COVERAGE.md).

---

## 3 · Pintar una pantalla no firma nada

El botón aparece siempre que la pantalla esté registrada, **tenga vídeo o no**.
Lo que no hace es preguntar por el vídeo.

Firmar una URL de reproducción cuesta una consulta y una llamada a Storage. Si
se hiciera al pintar, las 147 pantallas pagarían ese coste para que una minoría
de personas pulse el botón. Se hace al pulsar:

| Momento | Qué ocurre |
|---|---|
| Se pinta la pantalla | Se resuelve la clave. Nada más. Ni una consulta. |
| Se pulsa el botón | Se monta el diálogo, se pregunta y se firma. |
| Se cierra el diálogo | Se desmonta el vídeo y la URL firmada deja de usarse. |

En una pantalla **sin clave** el botón no se pinta. No se pinta deshabilitado ni
se esconde con CSS: no existe. Un botón apagado invita a preguntarse qué se hizo
mal, y no se hizo nada mal.

---

## 4 · Las dos ausencias, que no son la misma

La regla de siempre en este repositorio: **sin dato NO es cero**. Aquí se
traduce en tres estados y no en dos.

| Estado | Cuándo | Qué se ve |
|---|---|---|
| `ready` | Hay una versión publicada y se pudo firmar | El reproductor |
| `no_video` | La pantalla no tiene tutorial todavía | La copia congelada de PE-03A |
| `unavailable` | Algo falló al consultar o al firmar | «No se pudo preparar el vídeo ahora mismo. Vuelve a intentarlo en un momento.» |

La diferencia entre las dos últimas es la que importa. Si una avería se
presentara como «esta pantalla no tiene tutorial», nadie volvería a pulsar el
botón nunca más —y el vídeo estaba ahí—. La avería se dice como avería, e invita
a reintentar.

Ningún estado enseña el motivo técnico. Ni el código de error de Storage, ni la
ruta del objeto, ni el identificador de la versión.

---

## 5 · El reproductor

Controles nativos del navegador. Sin librería.

- **Sin reproducción automática.** Un vídeo que arranca solo con sonido en una
  oficina se cierra, no se ve.
- **`preload="metadata"`.** El navegador pide lo justo para dibujar la barra;
  los bytes llegan cuando alguien le da al play.
- **Teclado y lectores.** El diálogo es `role="dialog"` con `aria-modal`, Escape
  lo cierra, el foco queda atrapado dentro mientras está abierto y **vuelve al
  botón** al cerrarse. Perder el foco deja a quien navega con teclado al
  principio de la página sin señal de qué pasó.
- **Cambiar de pantalla lo cierra.** El estado guarda *en qué* pantalla se abrió,
  no un simple «abierto», así que el diálogo se cierra solo al navegar. Sin eso,
  quien navega con el tutorial abierto se quedaría viendo el de la pantalla
  anterior.

La renovación de la URL mientras el vídeo corre está en
[PE_03B3_PLAYBACK_RENEWAL.md](PE_03B3_PLAYBACK_RENEWAL.md).

---

## 6 · Ni un plan por el camino

Decisión congelada del propietario del producto: **ver un tutorial no depende de
ningún plan**. Si se puede ver la pantalla, se puede ver su tutorial.

La forma de garantizar que nadie se olvida de comprobar el plan es que **no hay
nada que comprobar**: `server/actions/tutorials.ts` no lee `organization_modules`,
ni `access_mode`, ni ninguna tabla comercial. Una prueba estática lo vigila
(H1), porque esta es exactamente la clase de cosa que alguien añade «por
coherencia» seis meses después.

Lo único que se exige es sesión: `requireSession()`. Un tutorial es contenido de
plataforma y no se sirve a quien no ha entrado.

---

## 7 · Qué NO hace este tramo

- No hay ventana de bienvenida ni tutorial de primer inicio. Eso es PE-03B4.
- No hay preferencia por persona («no volver a mostrar»). Eso es PE-03B4.
- No se creó ninguna clave de pantalla nueva ni se amplió el registro.
- No se tocó la consola de superadministrador salvo lo que exigía el transporte
  nuevo.
