# PE-03B5 · La aceptación integrada

B1, B2, B3 y B4 comprobaron cada pieza. Lo que ninguna comprobó es **la
secuencia completa**, que es donde aparecen los fallos de composición.

`tests/rls/pe03b5-integrated.test.ts` — 23 comprobaciones, una sola pasada
contra la base y el almacenamiento reales.

---

## 1 · La cadena, tal como la hace una persona

```
crear → reservar → subir → verificar → publicar → ver → adelantar
      → reponer → publicar la repuesta → retirar → reactivar
```

| | |
|---|---|
| **B1** | La identidad nace |
| **B2** | Dos versiones suben y se verifican · el resumen y el tamaño se comprueban |
| **B3** | Una tercera **miente** sobre su tamaño → queda `failed`, y publicarla se rechaza |
| **B4** | Publicar la primera · el cliente ve **esa** versión |
| **B5** | Publicar la segunda cierra el periodo de la primera **sin borrarla** |
| **B6** | La URL firmada apunta al objeto de la vigente, **no** al de la histórica |
| **B7** | Un rango devuelve **206** con los bytes del tramo pedido |

B6 y B7 son las dos que no se pueden falsear. B6 compara la URL firmada con la
ruta real de cada versión; B7 pide `bytes=2000-2999` y comprueba que el primer
byte es el que corresponde a ese desplazamiento en un archivo determinista — no
«mil bytes cualesquiera».

---

## 2 · Reponer no reabre la historia

| | |
|---|---|
| **C1** | La repuesta es una versión **nueva**: mismo objeto, mismo resumen, y guarda de cuál viene |
| **C2** | El periodo de la original **sigue cerrado** |
| **C3** | Reponer **no publica**. Publicar es un paso aparte |

### C3, y por qué la primera versión de esta prueba estaba mal

La primera versión de esta suite corría sobre `quality.processes` —una clave
real, compartida con la suite de PE-03B2— y exigía «al menos tres periodos». La
comprobación pasaba **por herencia**: esa clave ya tenía historia de pasadas
anteriores.

Sobre una clave limpia se ve lo que de verdad pasa, y lo que pasa es lo
correcto: `tutorial_restore_version` crea una **candidata verificada** y no
publica nada. La vigente sigue siendo la que era hasta que alguien pulsa
publicar.

Ahora la prueba comprueba eso: que la repuesta nace sin publicar, que la vigente
no cambió, y que **al publicarla explícitamente** la cronología pasa a tener
tres periodos con el de la original todavía cerrado.

Dos correcciones salieron de ahí:

1. La afirmación era falsa y pasaba por casualidad.
2. **Dos suites no pueden publicar sobre la misma identidad.** Una versión
   publicada no se puede borrar —que es justo lo que este subsistema promete—,
   así que la segunda en correr encontraba una publicación que no era suya. La
   suite integrada usa ahora su propia clave, y `pe03b2-tutorial-admin` vuelve a
   pasar en cualquier orden.

---

## 3 · Retirar y reactivar

**D1.** Retirado, el cliente recibe la ausencia. No otro vídeo, no un error.

**D2.** Reactivado, vuelve al servicio — y se compara la lista completa de
vigencias **antes y después**, byte a byte del JSON. Reactivar no toca ni una
fecha.

---

## 4 · Los papeles

| | |
|---|---|
| **E1** | Soporte consulta la consola y **no puede publicar ni renombrar** |
| **E2** | Una persona normal no lee ni una identidad de tutorial, ni reserva |
| **E3** | Pero **sí** ve el tutorial de su pantalla |

E1 no se conforma con leer un `canManage`: lo intenta. Soporte llama a
`tutorial_publish_version` y recibe un error; intenta renombrar y actualiza cero
filas. **Lo decide la base**, no la pantalla.

---

## 5 · Una pantalla registrada sin vídeo

**F1** elige, en tiempo de ejecución, una clave **real del registro** que no
tenga tutorial, y comprueba que devuelve ausencia y que no hereda ninguna
reproducción.

Es la comprobación de que 152 pantallas registradas y ~0 vídeos publicados es un
estado **normal y correcto**, no un producto a medio hacer.

---

## 6 · El esquema, tal como está hoy

**A1**, **A2** y **A3** no leen migraciones: interrogan la base.

- Se reservan 1 byte, 200 MB + 1 y **8 GB**: los tres se aceptan. Se reservan 0
  bytes: se rechaza.
- Se finaliza declarando **ocho horas** de duración: se acepta.
- Se lee el cubo por la API de Storage: `file_size_limit === null` y
  `public === false`.

---

## 7 · El fallo, provocado

**H1** borra el objeto de la versión vigente por debajo y comprueba que la
descarga falla limpiamente **y que la consulta de metadatos sigue funcionando**.
Después repone el objeto: una prueba que deja una referencia rota se convierte
en el problema que iba a detectar.

**H2** pide una clave desconocida y comprueba que es una ausencia, no una avería.

---

## 8 · La consola no hace una consulta por fila

**I1** envuelve `from()` y cuenta. Con **152 pantallas en el registro**, la lista
de la consola cuesta **2 consultas**.

No crece con el número de pantallas, que es lo que hay que garantizar cuando un
registro pasa de once a ciento cincuenta y dos.

Medido también, con el mismo método:

| Camino | Consultas |
|---|---|
| Pintar una pantalla del shell | **0** |
| Resolver el tutorial de una pantalla | 1 |
| Elegibilidad de la bienvenida | 2 |
| Lista de la consola | 2 |

El **0** es el que importa: 147 pantallas no pagan nada por que exista el botón.
