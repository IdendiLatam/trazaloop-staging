# QUALITY-13B1 · PRIMITIVAS DE INTEGRACIÓN

**Migración:** `0152_quality_process_automation_source.sql`
**Local** 0152 · **Staging** 0152 · **Production** 0111, sin tocar.

Sin interfaz. Sin mirador. Sin portada. Lo que B1 entrega es **la capa que las
hace posibles**, y las tres cosas que prometió no hacer siguen sin hacerse:
ninguna tabla nueva de negocio, ninguna mega-vista, ninguna sexta verdad de
atención.

---

## 1 · Qué se construyó

| Archivo | Qué es |
|---|---|
| `lib/domain/quality-integration.ts` | el contrato puro: tiempo, enlace, sección, atención, observador y la frontera de la tarea propia |
| `lib/db/quality-process-context.ts` | «qué está relacionado con el proceso X», compuesto y aislado |
| `lib/db/quality-position-context.ts` | «de qué responde este cargo» |
| `0152` | el proceso, observable por la automatización |

Cuatro suites, 43 comprobaciones.

---

## 2 · El contrato, pieza por pieza

### El tiempo (QI-29)

`TemporalScope` con tres formas: `current`, `as_of` con **su** fecha, `period` con
**sus** dos extremos. Y dos funciones que obligan a usarlo bien: `temporalLabel`, que
produce la etiqueta que la pantalla tiene que enseñar, y `sameMoment`, que responde si
dos datos se pueden enseñar juntos sin aclarar nada.

No todos los dominios tienen el mismo modelo temporal y no lo van a tener —hoy ocho
reconstruyen a fecha, ocho responden por periodo y ocho solo el presente—. Lo que este
contrato impide es mezclarlos en silencio.

### El enlace (QI-26)

Un mapa cerrado de veintisiete sujetos a sus rutas, con `deepLink(kind, id)` y
`hasDetailRoute(kind)`.

Existe porque hoy los adaptadores de Intelligence construyen veinte enlaces con
plantillas sueltas: el día que una ruta cambie habrá que encontrarlas todas. Y porque
`hasDetailRoute` evita la otra trampa: un control o una acción **no tienen ficha
propia**, y fabricarles una URL con su identificador llevaría a una página en blanco. En
esos casos el enlace lleva al listado de su dominio, que es un destino honesto.

Hay una prueba que abre el árbol de rutas de la aplicación y comprueba que **cada
destino declarado existe**. Un enlace a una página inexistente promete y falla.

### La sección (QI-04, QI-05)

`ContextSection` con tres estados: `ok`, `unavailable` y `not_visible`. El recuento es
`number | null`, y el `null` no es un descuido:

> **Cero riesgos** y **no se pudo leer los riesgos** son afirmaciones distintas, y solo
> una de las dos permite dormir tranquilo.

Es la misma clase de fallo que costó un sprint en QUALITY-12.2F, cuando una lectura
denegada se presentó como «todavía no hay consumo». Aquí no puede pasar: el tipo no
admite escribir `0` cuando no se sabe.

### La atención (QI-07…QI-11, QI-26)

`AttentionItem` con dominio, sujeto, motivo, estado, gravedad **del dominio si la tiene**,
enlace obligatorio, observador y clave. Y `attentionKey`, que es la pieza que decide si
la portada de B4 será fiable. Ver `QUALITY_13B1_ATTENTION_CONTRACT.md`.

### El observador

Cuatro tipos —fuente de verdad, observador activo, observador relevado, barrido
heredado— más `supersedes`. Es el vocabulario del inventario de 13A puesto en código,
para que B3 distinga sin adivinar. **B1 no releva ni borra nada**: eso es B3, y con
análisis de compatibilidad (QI-27).

### La frontera de la tarea propia (QI-24)

`DOMAIN_NATIVE_TASK_TABLES` y `isDomainNativeTask`. Existe para que ningún cargador de
integración dé por sentado que «todo lo pendiente es una acción»: si lo diera, la bandeja
de acciones se convertiría en un calendario de formación.

---

## 3 · Una tabla nueva: ninguna

`0152` **no crea ni una**. Amplía dos CHECK de vocabulario, registra una fuente con sus
ocho campos y añade una rama a `quality_automation_subjects`. Hay una prueba que falla si
aparece un `create table` o un `create view` en esa migración, y otra que comprueba que
las seis tablas que 13A prohibió expresamente —`quality_attention`,
`quality_process_context`, `quality_integration`, `quality_dashboard`,
`quality_supplier_processes`, `quality_complaint_processes`— no existen.

---

## 4 · Composición, no mega-vista

Nueve secciones que se leen **a la vez** y **no comparten nada**. Una o dos consultas por
sección, recuentos con `count: "exact", head: true` —la base cuenta y no manda filas— y
muestras con `limit`.

Medido: **un proceso con 1 riesgo y un proceso con 41 cuestan exactamente las mismas
consultas.** La prueba envuelve el cliente en un contador y compara; no confía en que el
código «parezca» eficiente.

---

## 5 · Un hallazgo del descubrimiento que solo aparece al escribir el código

Tres columnas no se llamaban como parecía, y las tres habrían devuelto silenciosamente
cero:

- el indicador guarda su proceso en **`scope_process_id`**, no en `process_id`, y
  además exige declarar `scope_type = 'process'` a la vez (hay un CHECK que los ata);
- el hallazgo de auditoría no tiene `title`, `status` ni `severity`: tiene
  **`statement`**, **`evaluation_status`** y **`proposed_severity`**, y «abierto»
  significa **sin evaluar**;
- **`processes` no estaba** en el CHECK de dominios de `quality_automation_sources`. El
  eje primario de integración llevaba desde 0129 fuera del catálogo de fuentes.

Ninguno se habría visto leyendo documentación.

---

## 6 · Qué habilita esto, y qué NO es todavía

**B2 · Mirador de proceso** puede construirse ya: el cargador devuelve las nueve
secciones con recuento, muestra y enlace, y el patrón congelado —resumen → recuento →
enlace profundo— cabe exactamente en `ContextSection`.

**B3 · Convergencia** tiene el vocabulario de observadores y la clave de deduplicación.
Le falta lo suyo: las plantillas que relevan los diez barridos, medidas contra lo que
emitían.

**B4 · Portada** tiene el `AttentionItem` y la deduplicación. Le falta el cargador que lo
alimente desde las fuentes.

**B5 · Intelligence** puede reutilizar el contexto de proceso sin reescribir consultas, y
el contrato ya conserva lo que hace falta para citar: procedencia, enlace y tiempo.

**Lo que NO hay:** ni una pantalla nueva, ni un cambio en la portada actual, ni el
renombrado del grupo de navegación a «Evaluación» —que está congelado en QI-25 y se
implementa cuando haya navegación que tocar—, ni una sola llamada a un proveedor de IA.
