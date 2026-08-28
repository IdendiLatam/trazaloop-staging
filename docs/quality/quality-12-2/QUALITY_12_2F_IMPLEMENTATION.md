# QUALITY-12.2F · Consumo, límites y coste de Intelligence

> Rama `feature/quality-12-2f-intelligence-usage-and-cost`, desde `a4bc7da`.
> **Local 0140 · Staging 0140 · Production 0111 — sin tocar.**

Cinco sprints han construido cuatro capacidades que llaman a un proveedor que
cobra por token. Hasta hoy nadie podía responder a tres preguntas que un
negocio tiene que poder responder:

> **¿Cuánto consume cada empresa? ¿Cuánto nos cuesta? ¿Qué impide que un bucle
> gaste sin freno?**

Este sprint construye la instrumentación. **No decide precios**: esa decisión
necesita los datos que esto empieza a producir.

---

## A · La decisión que evita un segundo libro de cuentas

`quality_ai_runs` ya guarda la verdad del proveedor desde 0132. Todo: entrada,
entrada cacheada, salida, razonamiento, total, proveedor, modelo, caso de uso,
empresa, actor, tiempos, latencia y si hubo llamada.

**Así que aquí no se crea ninguna tabla de consumo.** Un segundo registro de
tokens solo puede desincronizarse del primero, y el día que discrepen habrá que
decidir cuál miente.

Lo que sí faltaba y se crea:

| | |
|---|---|
| `intelligence_model_pricing` | tarifa versionada en el tiempo |
| `intelligence_usage_limits` | topes por empresa |
| `intelligence_limit_overrides` | excepciones con motivo y caducidad |
| `intelligence_use_cases` | qué cuesta cada capacidad, **medido** |
| cuatro vistas | derivadas de los runs, no contadores |

Las vistas **no pueden desincronizarse**: se recalculan al mirar. Y hay una
prueba de reconciliación que suma los runs a mano y los compara con lo que
devuelve la vista.

Detalle en `QUALITY_12_2F_COST_MODEL.md` y `QUALITY_12_2F_USAGE_LIMITS.md`.

---

## B · Tres defectos que aparecieron por el camino

Los tres se encontraron con pruebas, y los tres eran reales.

### 1 · `provider_called` nacía en `true`

Desde 0134. Una operación que se abría, fallaba por tiempo de espera y **nunca
llegaba a hablar con el proveedor** quedaba registrada como si hubiera llamado.

El coste salía bien —cero tokens, cero dólares—, así que nadie lo habría notado.
Pero el **recuento de llamadas al proveedor** mentía, y ese recuento es justo lo
que este sprint construye para poder decidir un precio.

Lo encontró una prueba que fallaba un run a propósito y luego iba a mirar cómo
había quedado registrado.

Arreglo en dos partes: el valor por defecto pasa a `false` —se afirma que hubo
llamada, no se supone— y cerrar en fallo acepta decir si la hubo. Un tiempo de
espera no llamó a nadie; una respuesta que no cumplió el esquema **sí llegó del
proveedor y sus tokens se gastaron**, y quien cierra la operación es el único
que sabe cuál de las dos fue.

**Las filas que ya existen no se tocan.** Reescribirlas sería falsificar el
registro para que cuadre con una regla escrita después.

### 2 · El arreglo de eso creó una función ambigua

Para no romper a quien llamaba con tres argumentos, dejé las dos versiones y
que la corta delegara en la larga. Parecía lo prudente.

Fue peor. Con dos funciones del mismo nombre, **PostgREST tiene que elegir
candidata a partir de las claves del JSON**, y una llamada de tres argumentos se
queda sin resolver. El resultado no fue un error visible sino una operación que
**no se cerraba**: la prueba que iba a comprobar un fallo se encontraba con un
run todavía abierto y pasaba por otro motivo.

Una sola función con el cuarto parámetro por defecto se llama de las dos formas
y no hay nada que adivinar. La versión de tres argumentos se elimina.

### 3 · Los límites estaban calibrados para una persona

El primer intento: 12 por minuto, 120 por hora, 5 000 al mes. Números
razonables… para **una persona** escribiendo documentos.

Lo enseñaron las suites de 12.2C y 12.2D al empezar a fallar con «demasiadas
operaciones seguidas». **Estos límites son POR EMPRESA**, y una empresa son
veinte personas.

Recalibrados sobre un equipo: **60 / 600 / 10 000**, con 8 simultáneas. La
justificación completa está en `QUALITY_12_2F_USAGE_LIMITS.md`, con la lección:
*un límite por organización no se calibra pensando en una persona*.

---

## C · La atomicidad, sin inventar infraestructura

Un `count(*)` seguido de un `insert` deja pasar cincuenta peticiones
simultáneas. No hace falta un sistema distribuido: hace falta que las
operaciones de **una** empresa se serialicen entre sí, y Postgres lo hace con
un bloqueo de aviso **por transacción**. Se suelta solo cuando la transacción
termina, incluso si el proceso se cae.

Hay una prueba que lanza cincuenta peticiones a la vez con un límite de cinco y
exige que pasen exactamente cinco.

---

## D · Lo que ve cada quien

### La empresa · en Datos de empresa

Cuántas operaciones lleva este mes, de cuántas dispone, el desglose por
capacidad y su estado. **Ni un dólar, ni un token suelto.**

Una empresa compra Trazaloop, no tokens de un proveedor. Enseñarle «llevas
gastados 0,73 USD» la invita a pensar en una economía que no es la suya y abre
una conversación —«¿y si uso menos?»— que no queremos tener: usar Intelligence
es lo que hace que su documentación mejore.

Y el copy dice que el tope es **técnico, de seguridad**, no una cuota comercial,
porque eso es lo que es hoy.

### La plataforma · en `/platform/intelligence`

Tres bloques con títulos distintos a propósito: **observado por empresa**,
**observado por capacidad** y **previsión**. Mezclar el tercero con los dos
primeros convertiría una hipótesis en un informe de consumo.

Existe para responder a una pregunta concreta —¿alguna empresa consume mucho
más que las demás?— y marca en ámbar la que supera cinco veces la media.

Ninguna de las dos enseña una letra de lo que nadie escribió: para ver cuánto
cuesta una consulta no hace falta leerla.

---

## E · Lo que NO se ha hecho

| | |
|---|---|
| Precio comercial | **no** — necesita los datos que esto produce |
| Plan de IA, créditos, paquetes | **no** — hay pruebas que lo verifican |
| Diferencia Full / Extra | **no** — reciben lo mismo, con dos pruebas |
| Cambio en Demo | **no** — mismo comportamiento |
| Motor de correos o segundo bus | **no** — se emite en `work_events` |
| Segundo registro de tokens | **no** — la verdad sigue siendo una |

---

## F · Gaps

**Blóqueres: 0. Gaps de 12.2F: 0.**

**Anotado, con datos ya disponibles para decidirlo:**

- **el precio comercial y qué se incluye en cada plan.** Los números están en
  `QUALITY_12_2F_FORECAST.md`;
- **la latencia desglosada** entre construir contexto y esperar al proveedor.
  Hoy se registra la total. Con 4–7 consultas la parte de contexto tiene que ser
  pequeña, pero afirmarlo sin medirlo sería justo lo que aquí no se hace;
- **el caché de entrada en uso continuado**, que 12.2D dejó sin confirmar.
