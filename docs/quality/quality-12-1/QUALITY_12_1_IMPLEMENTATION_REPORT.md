# QUALITY-12.1 · Informe de implementación

**Rama** `fix/quality-12-1-openai-live-provider` · sobre `383124d` (cierre de
QUALITY-12)
**Migración** `0133_quality_ai_copilot_completion.sql` · Staging al **0133**
**Preview** `https://trazaloop-production-k3yy1hfq8-idendi-latam-s-projects.vercel.app`
**Production** intacta, en **0111**

---

## Qué pedía este sprint, y qué se hizo

QUALITY-12 se entregó con veredicto **«READY WITH GAPS»** y tres huecos
declarados. Este sprint los cierra.

### GAP-01 · No había proveedor en vivo — **cerrado**

Se añadió un **tercer adaptador** detrás del contrato que ya existía. No cambió
el orquestador, ni el constructor de contexto, ni una sola pantalla, ni el
esquema de la respuesta: enchufar un proveedor real no obligó a tocar el
dominio, que es exactamente para lo que la abstracción estaba.

Detalle en `QUALITY_12_1_PROVIDER_OPENAI.md`.

### GAP-02 · Siete fuentes declaradas sin adaptador — **cerrado**

Las diecinueve del catálogo tienen adaptador. El de documentos —el que exigía
cuidado— lee la revisión **vigente en la fecha preguntada** y su contenido
congelado, recorta con tope y lo dice, y mete el texto como material marcado.

Detalle en `QUALITY_12_1_SOURCE_ADAPTERS.md`.

### GAP-03 · Temas de clientes sin persistir — **cerrado**

Un tema es ahora una fila con periodo, procedencia congelada y un recuento que
sale de la evidencia real. La serie es el mismo tema en dos periodos. Nace como
propuesta y la confirma una persona.

Detalle en `QUALITY_12_1_CUSTOMER_THEMES.md`.

---

## Lo que se descubrió por el camino

Tres cosas que no estaban en el encargo y que salieron al escribir las pruebas.

**Una vista sin `security_invoker`.** La primera versión de
`v_quality_ai_customer_theme_series` no lo llevaba, y por tanto habría devuelto
temas de **cualquier** empresa a quien supiera el identificador. Lo cazó la
prueba `C8` de `test:quality121-rls`, que es precisamente la que pregunta desde
una empresa ajena. Corregido antes de aplicar nada.

**Una unión que escondía los temas al equipo.** La serie unía con
`quality_ai_runs` para traer la procedencia, y esa tabla solo la lee su autor
(§119). El resultado habría sido que un tema —trabajo compartido— solo lo viera
quien lanzó la consulta. Se resolvió copiando la procedencia a la propia fila
del tema, que además es mejor: congelada ahí, cambiar el modelo mañana no
reescribe la historia.

**Dos claves del panel de consumo que no existían.** La pantalla de QUALITY-12
leía `runs_today_by_me` y `failures_this_month`; la función devuelve
`runs_today` y `failed_this_month`. El panel llevaba mostrando ceros. Corregido
de paso.

---

## Los criterios de cierre

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| 1 | rama correcta sobre el cierre de Q12 | **PASS** | `fix/quality-12-1-openai-live-provider` sobre `383124d` |
| 2 | no se inicia QUALITY-13 | **PASS** | ningún objeto ni documento de Q13 |
| 3 | Production sin tocar | **PASS** | remota en 0111 · sin variables de IA |
| 4 | proveedor OpenAI implementado | **PASS** | `lib/ai/providers/openai.ts` |
| 5 | detrás del contrato existente | **PASS** | `QualityAiProvider` sin cambios de forma · prueba C4 |
| 6 | `store: false` | **PASS** | prueba C1 |
| 7 | salida estructurada estricta | **PASS** | prueba C4 |
| 8 | sin variables nuevas | **PASS** | prueba A2 |
| 9 | credencial solo servidor | **PASS** | pruebas A1, A2 |
| 10 | credencial nunca en cliente | **PASS** | prueba A1 |
| 11 | credencial nunca en registro ni error | **PASS** | prueba A3 |
| 12 | consumo con el detalle informado | **PASS** | prueba C7 · D1 contra base |
| 13 | esfuerzo de razonamiento bajo, documentado | **PASS** | prueba B3 · `PROVIDER_OPENAI.md` |
| 14 | sin `temperature` conflictiva | **PASS** | prueba C3 |
| 15 | tope de salida | **PASS** | prueba C5 |
| 16 | tope de tiempo | **PASS** | prueba C5 |
| 17 | taxonomía de fallo completa | **PASS** | prueba C6 |
| 18 | el fallo no tumba Calidad | **PASS** | Q12 prueba G · sin cambios |
| 19 | ninguna clave pedida ni impresa | **PASS** | `SECRET_HANDLING.md` |
| 20 | variables solo Preview + esta rama | **PASS** | `vercel env ls preview` |
| 21 | Production sin variables de IA | **PASS** | verificado |
| 22 | las 19 fuentes con adaptador | **PASS** | prueba D1 |
| 23 | cada adaptador con su semántica temporal | **PASS** | prueba D2 |
| 24 | documento: revisión de la fecha | **PASS** | prueba D4 · B2 contra base |
| 25 | documento: extractos con tope, declarados | **PASS** | prueba D5 · limitación en el paquete |
| 26 | documento: texto como material | **PASS** | prueba D6 · B2b · G4 |
| 27 | los siete adaptadores citan con enlace | **PASS** | prueba A1 contra base |
| 28 | quejas tras el interruptor y la RLS | **PASS** | prueba D3 · A1 |
| 29 | conocimiento sin nombrar personas | **PASS** | lee la vista de continuidad |
| 30 | acciones sin declarar eficacia | **PASS** | solo lee `effectiveness_result` |
| 31 | reglas: qué vigila la plataforma | **PASS** | adaptador `automation_rule` |
| 32 | recuentos en el servidor | **PASS** | prueba D7 |
| 33 | temas persistidos con periodo | **PASS** | prueba C1 contra base |
| 34 | procedencia del tema | **PASS** | prueba C1 · congelada en la fila |
| 35 | recuento desde la evidencia real | **PASS** | prueba C2 · E1 |
| 36 | evidencia de esa misma consulta | **PASS** | prueba C4 · E3 |
| 37 | el tema no identifica a nadie | **PASS** | prueba C3 · E5 |
| 38 | serie temporal del tema | **PASS** | prueba C5 · F7 |
| 39 | el tema nace como propuesta | **PASS** | prueba C1 |
| 40 | confirmar/descartar lo firma una persona | **PASS** | prueba C6 · E6 |
| 41 | el tema no se borra | **PASS** | prueba C7 · E7 |
| 42 | los temas no se escriben a mano | **PASS** | prueba C7 · I3 de Q12 |
| 43 | fuera de su uso no se escriben temas | **PASS** | prueba E4 · G6 |
| 44 | sin voz del cliente no hay temas | **PASS** | prueba C9 |
| 45 | proveedor desconocido → fallo seguro | **PASS** | prueba B1 · D2 |
| 46 | sin credencial no se llama | **PASS** | prueba A4 · D3 |
| 47 | la pantalla dice la verdad | **PASS** | bloque de Consumo |
| 48 | credencial de relleno no cuenta | **PASS** | prueba D5 |
| 49 | modelo solo desde el servidor | **PASS** | prueba B2 |
| 50 | sin búsqueda web | **PASS** | prueba C2 |
| 51 | sin ficheros alojados ni vectores | **PASS** | prueba C2 |
| 52 | sin ejecución de código | **PASS** | prueba C2 |
| 53 | sin herramientas del proveedor | **PASS** | prueba C2 |
| 54 | la 0132 no se editó | **PASS** | prueba F1 · `git diff` vacío |
| 55 | 0133 append-only y adyacente | **PASS** | prueba F2 |
| 56 | RLS en las tablas nuevas | **PASS** | prueba F3 |
| 57 | revocación antes de conceder | **PASS** | prueba F3 |
| 58 | solo lectura; escritura por RPC | **PASS** | prueba F4 |
| 59 | `search_path` en toda función definer | **PASS** | prueba F5 |
| 60 | sin firma ambigua de cierre | **PASS** | prueba F6 |
| 61 | la serie sin identidad | **PASS** | prueba F7 |
| 62 | la vista con `security_invoker` | **PASS** | prueba C8 |
| 63 | aislamiento entre empresas | **PASS** | prueba C8 · I1 de Q12 |
| 64 | el anónimo no alcanza nada | **PASS** | prueba I4 de Q12, ampliada |
| 65 | barreras: no aprueba documentos | **PASS** | prueba G1 |
| 66 | barreras: no reescribe procedimientos | **PASS** | prueba G2 |
| 67 | barreras: no crea objetivos ni controles | **PASS** | prueba G3 |
| 68 | inyección dentro de un documento | **PASS** | prueba G4 |
| 69 | los borradores no se citan como vigentes | **PASS** | prueba G5 |
| 70 | los tres proveedores conviven | **PASS** | `test:quality12` 70 ✔ |
| 71 | suite nueva registrada en `test:all` | **PASS** | `test:quality121` |
| 72 | suite de base real nueva | **PASS** | `test:quality121-rls` 22 ✔ |
| 73 | `test:quality12-rls` ampliada | **PASS** | 31 ✔ |
| 74 | `test:quality12-safety` ampliada | **PASS** | 25 ✔ |
| 75 | `test:all` en verde | **PASS** | EXIT 0, dos veces |
| 76 | réplica limpia de migraciones | **PASS** | 0001…0133 desde cero |
| 77 | Staging aplicada y alineada | **PASS** | 125 migraciones, sin desalineadas |
| 78 | Preview construido y accesible | **PASS** | `k3yy1hfq8` · Ready |
| 79 | entregables completos | **PASS** | once documentos |
| 80 | validación real contra OpenAI | **PENDIENTE** | requiere la credencial |
| 81 | veredicto final | **PENDIENTE** | depende del 80 |

**79 PASS · 2 PENDIENTES · 0 FALLOS**

Los dos pendientes son el mismo hecho: **falta la credencial**, y es la única
intervención humana que este sprint necesita.

---

## Veredicto provisional

> **QUALITY-12.1 COMPLETO A FALTA DE LA CREDENCIAL**

Todo lo que no requiere secreto está implementado, probado contra base real,
aplicado en Staging y desplegado en Preview. Production no se ha tocado.

El veredicto definitivo —`QUALITY-12.1 OPENAI COPILOT READY FOR USER TESTING`—
se emite cuando la validación real contra OpenAI esté hecha, y no antes: dar por
buena una llamada que nunca ocurrió sería exactamente lo que este sistema está
construido para no hacer.
