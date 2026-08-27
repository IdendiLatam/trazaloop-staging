# QUALITY-12.1 · Qué se comprueba, dónde y con qué

## Las cuatro suites

| Suite | Cómo se ejecuta | Qué comprueba | Resultado |
|---|---|---|---|
| `test:quality121` | estática, sin base ni credencial | el adaptador, la configuración, la cobertura de fuentes, la 0133 | **35 ✔ · 0 ✘** |
| `test:quality121-rls` | base real, sesión de usuario | las siete fuentes, la revisión histórica, los temas, el consumo, la elección de proveedor | **22 ✔ · 0 ✘** |
| `test:quality12-rls` (ampliada) | base real | lo de QUALITY-12 + las tablas nuevas bajo RLS | **31 ✔ · 0 ✘** |
| `test:quality12-safety` (ampliada) | base real | las barreras + la orden escondida en un procedimiento | **25 ✔ · 0 ✘** |

`test:quality121` está registrada en `test:all`. Las tres que necesitan base
real se ejecutan aparte, como el resto de suites de RLS del repositorio.

## `test:quality121` · lo que se puede comprobar sin credencial

**A · la credencial** — server-only y sin `NEXT_PUBLIC`; se lee en un solo
sitio; no se imprime ni en un error; sin ella no se llama a nadie.

**B · la configuración** — un proveedor desconocido no cae en OpenAI; el modelo
lo pone el servidor y ninguna acción lo acepta del formulario; el esfuerzo de
razonamiento es `low` por omisión y los niveles prohibidos no se admiten.

**C · la llamada** — `store: false`; ni búsqueda web, ni ficheros alojados, ni
almacenes vectoriales, ni ejecución de código, ni herramientas del proveedor;
sin `temperature` ni `top_p`; salida estructurada estricta que **además** se
valida; topes de salida y de tiempo; las cuatro formas de fallo distinguidas;
el consumo leído sin inventar.

**D · las fuentes** — las diecinueve del catálogo tienen adaptador; cada uno
declara la misma semántica temporal que el catálogo; la voz del cliente sigue
tras su interruptor; el de documentos lee por vigencia y del contenido
congelado; recorta y lo dice; el texto entra como material; los recuentos se
hacen en el servidor.

**E · los temas** — el modelo no cuenta; una cita fuera de rango se descarta;
la evidencia tiene que ser de esa consulta; solo se escriben en la consulta de
temas; la tabla no guarda nada que identifique; resolverlo exige persona; no se
borra.

**F · la 0133** — la 0132 intacta; la 0133 la última y adyacente; RLS y
revocación previa; solo lectura; `search_path` en toda función definer; sin dos
versiones de `quality_ai_complete_run`; la serie sin identidad.

## `test:quality121-rls` · lo que solo se ve contra una base

**A** · las siete fuentes nuevas llegan al contexto de verdad y se citan con
enlace.

**B** · el documento con dos revisiones: hoy dice «TRES días», al 2026-02-08
dice «CINCO días» y **no** dice tres; la cita guarda a qué fecha y a qué
revisión mira; el texto llega como nota y no como hecho.

**C** · los temas se guardan con periodo y procedencia; el recuento coincide
con la evidencia real; la evidencia es de esa consulta y no identifica;
una cita prestada da cero; la serie compara con el periodo anterior; confirmar
firma; el segundo intento de resolver falla; no se borra ni se escribe a mano;
la empresa ajena no ve nada; con la voz del cliente apagada no se escribe.

**D** · el detalle de consumo queda **vacío**, no a cero, cuando el proveedor
no lo informa; proveedor desconocido → doble; `openai` sin clave → doble;
`openai` con clave → se elige OpenAI (sin llamarlo); una clave de relleno no
cuenta como clave.

## Lo que estas suites deliberadamente NO hacen

**No llaman a OpenAI.** Una suite que necesita una credencial para pasar es una
suite que no se puede ejecutar: en una máquina nueva, en integración continua,
o dentro de un año. La llamada real se valida aparte, en Preview, y queda
anotada en `QUALITY_12_1_LIVE_VALIDATION.md`.

## Regresión completa

`npm run test:all` → **EXIT 0**, ejecutada dos veces: antes y después de
reconstruir la base local desde cero.
