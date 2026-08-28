# QUALITY-12.2F · Los límites

## Por qué no se miden en dólares

Porque el precio lo cambia otra empresa.

Si la autorización dependiera del coste en dólares, una subida de tarifa de
OpenAI apagaría Intelligence en **todos** nuestros clientes a la vez, sin que
nadie hubiera hecho nada y sin aviso.

Los topes se miden en **operaciones**, que es una unidad que controlamos. El
dinero se usa para verlo, informarlo y avisar. Un aviso a destiempo es molesto;
un apagón por sorpresa es otra cosa.

---

## Cuatro ventanas, cada una para algo distinto

| | Por defecto | De qué protege |
|---|---|---|
| Por minuto | **60** | el doble clic, el bucle accidental |
| Por hora | **600** | el uso automatizado que no debería existir |
| Al mes | **10 000** | el techo de seguridad |
| Simultáneas | **8** | veinte pestañas abiertas a la vez |

**No son una cuota comercial.** Son topes técnicos, y así lo dice la pantalla de
la empresa.

---

## De dónde salen esos números, y el error que costó descubrirlos

Una implantación intensiva son unas **350 secciones documentales** —250 de PCR
y Textiles ya existentes más unas 100 de Quality—. Con tres mejoras y una
revisión por sección salen **~1 500 operaciones**, repartidas en semanas.

**El primer intento puso 12 por minuto, 120 por hora y 5 000 al mes.** Los
números se razonaron sobre *una persona* escribiendo documentos, y eran
razonables para una persona.

Estaban mal, y lo enseñaron las suites de 12.2C y 12.2D al empezar a fallar con
«demasiadas operaciones seguidas». **Estos límites son POR EMPRESA**, y una
empresa son veinte personas: veinte personas haciendo una operación cada una
dentro del mismo minuto son veinte operaciones, sin que nadie esté haciendo
nada raro.

Recalibrados sobre un equipo:

- **60 por minuto** — veinte personas a tres por minuto cada una es más de lo
  que produce nadie escribiendo. Un doble clic son dos; un bucle son cientos.
- **600 por hora** — treinta por persona sostenidas una hora entera. Un equipo
  real no llega; un script sí.
- **10 000 al mes** — casi siete veces la implantación intensiva completa.
- **8 simultáneas** — frena las pestañas sin frenar al equipo.

> La lección vale más que los números: **un límite por organización no se
> calibra pensando en una persona.**

---

## Blando y duro

| | Qué hace |
|---|---|
| **Umbral blando** (80 %) | emite un aviso. **No bloquea nada** |
| **Tope duro** (100 %) | deniega nuevas operaciones |

El tope duro se puede desactivar por empresa, y entonces el sistema solo avisa.
Queda registrado quién lo hizo.

**La decisión se toma ANTES de llamar.** Nunca se corta una respuesta que ya
salió hacia el proveedor: eso costaría el dinero y además perdería el
resultado.

---

## El derecho manda sobre el presupuesto

El orden importa, y hay una prueba por cada mitad:

```
1 · ¿pertenece a la empresa?
2 · ¿el documento es de ese módulo?
3 · ¿el módulo está en Full o Extra?     ← EL DERECHO
4 · ¿queda presupuesto?                  ← EL PRESUPUESTO
```

Una empresa en Demo con cero consumo **sigue sin acceso**. El presupuesto solo
puede quitar, nunca dar. El guardián ni siquiera sabe qué plan tiene la
empresa: no consulta el módulo, y una prueba lo comprueba leyendo su código.

---

## Full y Extra reciben lo mismo

Repetido a propósito, porque es fácil de erosionar.

La diferencia comercial vigente entre Full y Extra es **almacenamiento**.
Derivar de ahí una diferencia de Intelligence habría sido inventar producto en
un sprint que no decide producto.

La tabla de límites **no conoce el plan** —hay una prueba que lo verifica
leyendo su definición— y otra que lee los límites efectivos con Full, cambia a
Extra y exige que salga exactamente lo mismo.

---

## La concurrencia, sin inventar infraestructura

Un `count(*)` seguido de un `insert` deja pasar cincuenta peticiones
simultáneas: las cincuenta leen el mismo recuento antes de que ninguna escriba.

No hace falta un sistema distribuido. Hace falta que las operaciones de **una**
empresa se serialicen entre sí, y eso Postgres lo hace con
`pg_advisory_xact_lock` por empresa. Es **por transacción**: se suelta solo
cuando termina, incluso si el proceso se cae.

Hay una prueba que lanza **cincuenta peticiones a la vez** con un límite de
cinco, y exige que pasen exactamente cinco.

### Las operaciones en vuelo

No hay tabla de reservas: una operación en vuelo es una fila con
`status = 'running'`, que ya existía. Se cuentan solo las de los **últimos diez
minutos**, porque si un proceso muere sin cerrar su run, esa fila se queda en
`running` para siempre y bloquearía a la empresa hasta que alguien lo mirara a
mano. Hay una prueba con un run colgado de hace una hora.

---

## Las ventanas de tiempo

**En UTC**, y dicho en el código porque las organizaciones no tienen zona
horaria en Trazaloop. Cuando la tengan, hay un solo sitio que cambiar.

Depender de la zona del navegador para algo que se impone en el servidor sería
regalar el límite a quien cambie la hora de su portátil.

---

## Excepciones

Ampliar el techo a una empresa concreta —una migración masiva, una incidencia,
una prueba— **sin tocar su plan ni el de las demás**.

Con **motivo obligatorio** de diez caracteres mínimo, con autor, y con
**caducidad**. Una excepción sin fecha de fin deja de ser una excepción al cabo
de unos meses: se convierte en la regla y nadie recuerda por qué.

### Ver no es poder cambiar

| | Ver | Cambiar |
|---|---|---|
| Administrador de empresa | **sí**, los suyos | **no** |
| Personal de plataforma | todos | solo superadmin |

Si un administrador pudiera subirse su propio techo, el techo no sería un
techo. Hay tres pruebas: una comprueba que puede verlos, otra que su intento de
cambiarlos no mueve nada, y otra que no puede crearse una excepción.

---

## Los avisos reusan el bus que ya existe

Se emiten en `work_events` con `source_domain = 'ai'`, que es donde ya conviven
`ai.run_completed` y `ai.suggestion_accepted`. **No se ha construido un segundo
bus ni un motor de correos.**

| Evento | Cuándo | Emitido desde |
|---|---|---|
| `ai.usage_threshold_reached` | se cruza el umbral blando | la puerta, en SQL |
| `ai.usage_hard_limit_reached` | se alcanza el techo | el orquestador · **12.2F.1** |

### Por qué el segundo se emite desde otro sitio

12.2F cerró con este hueco: el tipo existía, el emisor lo soportaba, el
vocabulario del bus lo aceptaba, y **nadie lo llamaba**. Las dos puertas
invocan al emisor solo en el caso blando, porque cuando el tope duro deniega la
función retorna antes de llegar a esa línea.

**Y esa salida temprana no se toca.** Es la misma que evita crear una fila de
operación para registrar un rechazo: `quality_ai_runs` es el libro de lo que
llegó a ejecutarse, no de lo que se intentó.

Emitirlo dentro de la puerta obligaría a reescribir las dos funciones, o sea
una migración — para una emisión que faltaba de un tipo que ya existía, en un
bus que ya existía, con un emisor ya autorizado. Mover el esquema por comodidad.

Así que se emite desde el orquestador, justo después de la denegación, donde no
puede conceder nada. **Queda una asimetría y se dice en voz alta**: el aviso
blando nace en SQL y el duro en TypeScript. Se paga a cambio de no tocar el
esquema, y el día que haya otra razón real para reescribir esas funciones, el
emisor se muda allí.

### Veinte pulsaciones, un hecho

La deduplicación **no se inventó para esto**: es `dedupe_key` —
`tipo:empresa:AAAA-MM` con `on conflict do nothing` y su índice único—, el
mecanismo que `work_events` ya usaba. Hay una prueba que pulsa el botón
bloqueado veintiún veces y exige **un** hecho.

Los dos hechos conviven en el mismo mes: son momentos distintos —80 % y 100 %—
y sus claves difieren por el tipo.

Se llaman `ai.*` y no `intelligence.*` porque esa es la convención del bus: la
identidad visible es una cosa y el espacio técnico es otra, que es exactamente
la separación que congeló 12.2E.

**Un aviso por empresa y mes**, no uno por operación: el aviso es la noticia, no
cada una de las quinientas veces que sigue siendo cierta. Y **un aviso que falla
no tumba la operación** que lo provocó.

Q11 puede reaccionar a esos hechos sin que 12.2F sepa nada de automatización.
