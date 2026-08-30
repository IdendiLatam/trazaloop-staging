# QUALITY-12.3B3B · MATRIZ DE PRUEBAS

Cuatro suites nuevas, 38 comprobaciones. Todas verificadas por **código de salida**.

| Suite | Comando | Qué prueba | Dónde corre |
|---|---|---|---|
| Automatización | `npm run test:quality123b3b-automation` | A–M · 13 | base real |
| Intelligence | `npm run test:quality123b3b-intelligence` | W–AD · 8 | base real, sin proveedor |
| PDF y entrada contextual | `npm run test:quality123b3b-outputs` | N–V · 9 | build de producción, por HTTP |
| Ayuda contextual | `npm run test:quality123b3b-help` | AE–AL · 8 | estática |

Solo la de ayuda entra en `test:all`; las otras tres siguen el criterio de sus pares
—levantan servidor o escriben en la base— y se corren aparte.

---

## 1 · Automatización · `tests/rls/quality-12-3b3b-automation.test.ts`

| | Qué demuestra |
|---|---|
| A | tres fuentes, una por sujeto observable; cinco eventos, no cinco fuentes |
| B | los **cinco** eventos tienen contrato y cada uno resuelve a su fuente |
| C | ni un campo observable huele a dato personal; el cargo se observa por su nombre |
| D | los hechos se materializan con los recuentos correctos |
| E | un análisis **sucedido** deja de observarse |
| F | una estrategia sin cargo y sin método es observable como tal |
| G | cinco plantillas, **ninguna activa**, ninguna crea tareas por omisión |
| H | adoptar → publicar → barrer abre **una** señal; el segundo barrido no abre otra |
| I | corregir el hueco **resuelve** la señal sola |
| J | otra empresa no ve ni sujetos ni señales |
| K | los hechos se emiten solo tras un cambio con éxito: leer no emite, y una mutación rechazada tampoco |
| L | tres llamadas al mismo cambio dejan **un** hecho |
| M | la entrada de Revisión por la Dirección trae sus nueve claves y se calcula **sin IA** |

## 2 · Intelligence · `tests/rls/quality-12-3b3b-intelligence.test.ts`

| | Qué demuestra |
|---|---|
| W | las dos fuentes están registradas como adaptadores `as_of`, y el catálogo de la base dice lo mismo |
| X | el contexto trae referencias con identificador y enlace, hechos con fuente, y el recuento **ya calculado** |
| Y | ni un correo, ni un teléfono, ni el nombre de un contacto |
| Z | preguntar por una fecha **no** devuelve el estado de hoy; las referencias llevan su corte |
| AA | un texto con aspecto de instrucción **sigue llegando**, como dato, y el sistema advierte de ello |
| AB | otra empresa no obtiene nada |
| AC | construir el contexto no llama a ningún proveedor |
| AD | las seis preguntas sugeridas son preguntas, y ninguna pide declarar conformidad |

## 3 · PDF y entrada contextual · `tests/e2e/quality-12-3b3b-outputs.test.ts`

Contra el build de producción y por HTTP. Un PDF se prueba **descargándolo**: pedirle
su modelo al adaptador probaría el modelo, no la descarga, y en la descarga viven el
guardián de módulo, el rol, la RLS y el nombre del archivo.

| | Qué demuestra |
|---|---|
| N | el reporte se descarga y empieza por `%PDF` |
| O | la ficha se descarga y el nombre del archivo dice de qué es |
| P | el documento «al [fecha]» lleva la fecha en el nombre y **no es byte a byte** el de hoy |
| Q | el histórico **no** filtra el análisis de hoy |
| R | el reporte corriente **sí** declara que retrata el presente |
| S | otra empresa no descarga la ficha aunque tenga el identificador |
| T | sin sesión no hay PDF |
| U | los tres botones están en pantalla, y en modo histórico el botón **cambia** al documento de esa fecha |
| V | Intelligence se ofrece desde la ficha con el contexto fijado, y no hay una segunda caja de chat |

## 4 · Ayuda · `tests/unit/quality-12-3b3b-help.test.ts`

| | Qué demuestra |
|---|---|
| AE | están las once |
| AF | cada una tiene qué es, ejemplo y respaldo |
| AG | los ejemplos son de sector neutro |
| AH | se cita por apartado, no se transcribe, y los apartados existen |
| AI | **no** se le atribuye a la norma influencia × impacto ni una cadencia |
| AJ | cada ayuda está donde se necesita |
| AK | se reutiliza el componente compartido, sin infraestructura nueva |
| AL | ni tutoriales, ni vídeo de bienvenida, ni FAQ |

## 5 · Lo que se volvió a comprobar

- **Inmutabilidad del contenido histórico** (§32): `test:quality123b2-history` AW, que
  es la comprobación que encontró el defecto del guardián de 0149 y que ya no se limita
  a las columnas de vigencia.
- **Frontera de `work_references`** (§33): `test:quality123b2-integrations` AO2 en los
  dos sentidos —lo periférico entra, las dos relaciones centrales no—, y la comprobación
  estática AB de B3A.
- **P1–P10**: `test:quality123b3a-e2e`, **EXIT=0** después de B3B.

## 6 · Regresión completa

| Comprobación | Resultado |
|---|---|
| `npm run test:all` | **EXIT=0** |
| `typecheck` · `lint` · `build` | 0 · 0 errores · 0 |
| `quality123`, `quality123-rls` | 0 · 0 |
| `quality123b2-*` (cuatro) | las cuatro 0 |
| `quality123b3a-ux`, `-ui`, `-e2e` | 0 · 0 · 0 |
| `quality123b3b-*` (cuatro) | las cuatro 0 |
| QUALITY-11 automatización, EXPORT-01/01.1/01.2, `deploy-safety` | dentro de `test:all`, 0 |
| Replay limpio 0001 → 0151 | cabecera 0151 · 143 en disco · 143 registradas · 0 fallos |

## 7 · Dos pruebas que cambiaron, y por qué

**QUALITY-11 · V6.** Buscaba cada dominio del vocabulario dentro de 0129. Caducó al
extender el CHECK desde una migración posterior, que es como crece cualquier catálogo
aquí; mantenerla habría obligado a **editar una migración ya aplicada** para que pasara.
Ahora lee la última definición de cada CHECK, esté donde esté, y compara los conjuntos
en las dos direcciones —más estricta que antes—.

**EXPORT-01.2 · A4.** Rechazó «Informe de partes interesadas»: la plataforma exige que
un listado se llame Listado, Lista maestra, Maestro o Reporte. Se renombró a **Reporte
de partes interesadas**. Sesenta documentos con la misma convención valen más que uno
con el nombre que a este dominio le sonaba mejor.


---

## 8 · Humo de navegador de B3B · NO ejecutado, y por qué

El Preview de B3B es
`https://trazaloop-production-1uzoons2d-idendi-latam-s-projects.vercel.app`, **Ready**
y con SSO activo. Cada despliegue del CLI nace en su propio host, así que la sesión de
aplicación del Preview anterior no viaja y el nuevo pide iniciar sesión. Se consultó, y
la decisión fue cerrar sin ese paso.

**Lo que eso deja sin mirar con los ojos:** las capturas de A–H del encargo —la pantalla,
la entrada contextual a Intelligence, los dos PDF descargados desde el navegador, la
ayuda «i» enriquecida— y la comprobación visual de que no aparece ninguna interfaz de
tutorial.

**Lo que NO queda sin verificar**, porque lo cubre `test:quality123b3b-outputs` contra el
build de producción y por HTTP con una sesión real:

- los tres PDF se descargan y empiezan por `%PDF`;
- el de una fecha lleva la fecha en el nombre y **no es** el de hoy;
- el histórico no filtra el análisis actual y el corriente declara que es el presente;
- otra empresa no descarga la ficha, y sin sesión no hay PDF;
- los tres botones están en la pantalla, y en modo histórico el botón **cambia**;
- Intelligence se ofrece desde la ficha con el contexto fijado, y no hay una segunda
  caja de chat.

Y `test:quality123b3a-e2e` volvió a recorrer P1–P10 después de B3B, en **EXIT=0**: la
interfaz no se rompió.

Queda pendiente, entonces, el juicio visual: si la fila de botones de la cabecera se lee
bien, si el PDF impreso resulta legible en papel, y si la ayuda enriquecida ayuda de
verdad. Eso es trabajo de una persona mirando, no de una suite.
