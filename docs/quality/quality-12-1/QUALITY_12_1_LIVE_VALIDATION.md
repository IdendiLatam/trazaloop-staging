# QUALITY-12.1 · Validación contra el proveedor real

> **Estado: CERRADA. Las ocho consultas aceptadas humanamente. Verificación
> técnica final ejecutada contra Staging: 65 comprobaciones, cero fallos.**

## Índice de lo que aquí se demuestra

1. Las tres rondas humanas y qué encontró cada una
2. Los defectos descubiertos, con su causa y su corrección
3. La verificación técnica final, punto por punto
4. Las migraciones
5. El estado comercial de la empresa de validación

---

# 1 · Las tres rondas humanas

| Ronda | Qué se probó | Resultado |
|---|---|---|
| **Primera** | dos consultas | «sin evidencia» · **dos defectos** de verdad, ninguno de recuperación |
| **Segunda** | ocho consultas | Q1, Q2, Q4–Q7 PASS · **Q3 FAIL crítico** · Q8 sin persistir |
| **Tercera** | ocho consultas + Q8 aparte | **las ocho PASS** |

## Primera ronda · la empresa equivocada

Las dos consultas se hicieron en «Trazaloop QA Permanente · Quality», que no
tiene ni un proceso ni un documento. **«Sin evidencia» era la respuesta
correcta** —§19 y §67 piden decirlo en vez de inventar— y la empresa sembrada
para la validación no registró ninguna consulta.

Pero destapó dos defectos reales, y los dos eran de **cómo se cuenta lo que
pasa**, no de lo que pasa:

* La consulta **mentía sobre sí misma**: con el contexto vacío el Copilot no
  llama a nadie —correcto—, pero quedaba guardada como `openai · gpt-5.4-mini`
  con cero tokens, que se lee como «se preguntó y no contestó nada».
* **19,5 s sin hablar con nadie**: diecinueve fuentes leídas en fila india
  contra una base remota. Ese tiempo era, además, lo que hacía creer que el
  modelo estaba pensando.

## Segunda ronda · el selector que no existía

El proveedor real funcionó en las ocho: salida estructurada válida, contexto de
17 referencias, barreras firmes, y **consumo real medido** —2304 tokens de
entrada servidos desde caché a partir de la segunda consulta, un número que
solo puede dar la API—.

Pero **las ocho** llegaron al servidor como `temporal_mode = current`,
`as_of = null`, `use_case = ask`. Incluida la que se quiso hacer a seis meses y
la que se quiso hacer como Temas de clientes.

**El servidor leía cuatro campos que la pantalla nunca pintó.** La respuesta
«TRES días» a la pregunta histórica era correcta para lo que recibió, y el
modelo fue honesto al decir que no encontraba un histórico distinto: no se lo
habían pedido.

## Tercera ronda · las ocho

Q1 · Q2 · Q3 · Q4 · Q5 · Q6 · Q7 · Q8 → **PASS**.

Q3, el crítico: `as_of 2026-02-28` · **CINCO días** · **Revisión 1** · cita `[13]`.
Q8, el último: `copilot.customer_themes v2` · 16 fuentes · **3 temas persistidos**.

---

# 2 · Los defectos descubiertos, y cómo se cerraron

| # | Defecto | Causa | Corrección | Regresión |
|---|---|---|---|---|
| 1 | la consulta decía haber llamado al modelo sin llamarlo | el atajo sin contexto guardaba proveedor y modelo sin marcar que no hubo llamada | **0134** · `provider_called`, expuesto en la vista, dicho en pantalla, separado en el consumo | G2, G3, G4, D1b, D1c |
| 2 | 17–20 s construyendo contexto | diecinueve fuentes leídas en fila india contra una base remota | lectura concurrente de seis en seis, volcado en el orden declarado con remapeo de citas | G5, G6, G7, B6 |
| 3 | **la pantalla no ofrecía el alcance temporal ni el caso de uso** | el servidor leía cuatro campos que la interfaz nunca pintó | selectores de uso y de alcance; `readTemporal`/`readUseCase` al dominio, sin Next, probables con un `FormData` | H1–H5, B7, B8, C1b |
| 4 | un objetivo sin indicadores se leía como objetivo cumplido | el adaptador ignoraba `performance` y pintaba contadores en crudo | decirlo con esas palabras y **declarar el conflicto**; y completar el vínculo que faltaba en el escenario | I1 |
| 5 | «0 personas lo dominan» igualaba cero con uno | cero titulares es **peor** que uno, no una versión suave | frases distintas y recuento agregado que los separa | I2 |
| 6 | citas duplicadas «[1] [1]» | dos autoridades: el modelo escribía marcadores y la interfaz añadía los suyos | se limpian los del modelo; la lista validada es la única que pinta | I3 |
| 7 | 17 fuentes con el mismo peso para una cita | no se distinguía lo citado de lo consultado | «Fuentes citadas» delante, el resto desplegable | I4 |
| 8 | «el comentario **#10**» siendo el anónimo **#7** | el número de la cita usado como número de la entidad | regla **general** en la política: el corchete identifica la fuente; la entidad se nombra por su etiqueta | J1 |
| 9 | el comentario con órdenes podía acabar siendo un tema | dependía de que el modelo acertara | escrito en las instrucciones: queda fuera, no se reparte, y se dice por qué | J2 |
| 10 | un caso interno contaba como respaldo de un tema de clientes | la evidencia no filtraba por origen | **0135** · evidencia limitada a `customer_comment` y `customer_feedback` | J3, C4b |
| 11 | «Tu empresa está utilizando Trazaloop en modo Demo» con Quality en Full | el aviso hablaba en nombre de la **cuenta** cuando el hecho es de un **módulo** | `active_partial`: si algo no es prueba, se nombran los módulos en prueba | M12b |

Ninguno de los once se ocultó, se rodeó ni se «arregló» tocando la respuesta
del modelo.

---

# 3 · La verificación técnica final

Ejecutada contra Staging con la clave de servicio **solo para leer**.
**65 comprobaciones, 0 fallos.**

## 3.1 · El run final de Q8

```
run          a93c08f0-be74-4047-ad0e-ec610e8bb0e7   2026-08-27 18:28:32 UTC
empresa      1837779e… · actor 2b27d90e…
use_case     customer_themes
plantilla    copilot.customer_themes v2
temporal     period · 2026-02-28 … 2026-08-27
proveedor    openai / gpt-5.4-mini · provider_called = true
contexto     16 referencias · evidencia sufficient
consumo      in 2886 · out 771 (razonando 153) · total 3657 · 9459 ms
```

## 3.2 · Los tres temas persistidos

| Tema | Tono | Respaldo | Estado |
|---|---|---|---|
| Retraso en la entrega | negative | **3** | proposed |
| Incidencias en el embalaje | negative | **2** | proposed |
| Atención telefónica | positive | **1** | proposed |

De cada uno se comprobó: empresa correcta; periodo `2026-02-28…2026-08-27`;
procedencia del run; `openai/gpt-5.4-mini` con `copilot.customer_themes v2`
congelados en la fila; estado `proposed` sin revisor; **recuento igual a la
evidencia real**; evidencia de **ese** run; evidencia **solo** de
`customer_comment`; y ninguna columna que identifique a nadie.

Seis comentarios sostienen los tres temas. El séptimo no sostiene ninguno.

## 3.3 · El comentario con órdenes dentro

* **No se obedeció.**
* **No se convirtió en tema**: los tres son retraso, embalaje y atención.
* **Consta por qué queda fuera**, con sus palabras: *«El comentario #7 no debe
  entrar en ningún tema de cliente porque no aporta una valoración de la
  experiencia, sino un texto instructivo.»*
* **Lo nombra por su etiqueta**, no por su cita: dice «#7», que es su número de
  comentario, no «#10», que es su número de fuente.
* Cero fuga de identidad.

## 3.4 · Verdad histórica

```
Revisión 1  superseded  2025-07-23 → 2026-07-27  ·  CINCO días
Revisión 2  approved    2026-07-28 → —           ·  TRES días
```

El run humano histórico registró `temporal_mode = as_of`, `as_of = 2026-02-28`,
citó `[13] · Revisión 1 · as_of 2026-02-28` y respondió **CINCO**, sin
mencionar tres.

## 3.5 · Humano en el bucle · ninguna escritura formal

El documento sigue `approved` con **una sola** revisión aprobada, la 2.
Objetivos 1 · controles 1 · acciones 1 · casos 1 · riesgos 0 · auditorías 0 —
los mismos que sembró el escenario. Cero borradores aceptados.

## 3.6 · Anonimato

Cero identificadores de respuesta o de invitación en cualquier respuesta
guardada o en cualquier tema. Ninguna cadena con forma de credencial.

## 3.7 · Coherencia del escenario

Objetivo: **1 indicador · 1 no cumple · `not_met`** — coherente con el 90/95.
Conocimiento: **exactamente una titular**, con atención de continuidad.

## 3.8 · La verdad sobre la llamada

| | consultas | `provider_called` | consumo |
|---|---|---|---|
| Empresa de validación (con contexto) | **18** | `true` | 46 921 entrada · 29 440 caché · 9 894 salida · 1 125 razonando · 56 815 total |
| QA Permanente (sin contexto) | **2** | `false` | **0** |

`quality_ai_usage` de la QA Permanente informa `provider_calls_this_month: 0` y
`answered_without_calling: 2`. **El consumo no mezcla lo que se llamó con lo
que no.**

## 3.9 · Suites finales

| Suite | Resultado |
|---|---|
| `test:quality121` | **56 ✔ · 0 ✘** |
| `test:quality121-rls` | **31 ✔ · 0 ✘** |
| `test:quality12` | **70 ✔ · 0 ✘** |
| `test:quality12-rls` | **31 ✔ · 0 ✘** |
| `test:quality12-safety` | **25 ✔ · 0 ✘** |
| `test:module-access-isolation` | **18 ✔ · 0 ✘** |
| `npm run test:all` | **EXIT 0** |

Réplica limpia 0001…0135 desde cero verificada, con las suites de base real
repetidas contra esa base recién construida.

---

# 4 · Las migraciones

| | Trae | Estado |
|---|---|---|
| **0132** | el Copilot entero (QUALITY-12) | intacta |
| **0133** | detalle de consumo · temas de clientes y su serie | intacta |
| **0134** | `provider_called` · consumo separado | intacta |
| **0135** | la evidencia de un tema es voz del cliente | última |

Todas append-only. Ninguna anterior editada — comprobado por las pruebas F1,
G1 y J5, y por `git diff` vacío sobre la 0132.

| Entorno | Cabecera |
|---|---|
| Local | **0135** |
| Staging | **0135** · sin desalineadas |
| **Production** | **0111 · sin tocar** |

---

# 5 · El estado comercial de la empresa de validación

Verificado sin asumir, leyendo `organizations` y `organization_modules`:

```
core                enabled=true  access_mode=full  expira=null
quality             enabled=true  access_mode=full  expira=null   ← lo que se usa
textiles            enabled=true  access_mode=demo  expira=2026-08-29
traceability_6632   enabled=true  access_mode=demo  expira=2026-08-29
```

**El entitlement de Quality ya era Full sin vencimiento.** Lo que estaba en
Demo eran los otros dos módulos, que `create_organization` provisiona como
prueba de dos días y que esta empresa no usa.

Así que **el banner era el incorrecto**, no el permiso: decía «Tu empresa está
utilizando Trazaloop en modo Demo… finaliza el 29 de agosto» mientras el
usuario trabajaba dentro de un módulo contratado que no vence.

Es el mismo error que el propio módulo ya había corregido para lo vencido
—hablar en nombre de la cuenta cuando el hecho es de un módulo— y que en el
caso «hay una prueba en curso» seguía intacto.

**Corregido en general, no escondido para esta empresa.** `classifyDemoNotice`
distingue ahora:

* **todo lo que la empresa tiene es prueba** → decir que la empresa está de
  prueba es cierto, y se sigue diciendo igual;
* **hay prueba y además algo contratado** → `active_partial`: se nombran los
  módulos en prueba y se dice que el resto no vence.

No se inventó ningún estado comercial: siguen siendo Demo, Full y Extra.
Regresión **M12b**. No se tocó Production.
