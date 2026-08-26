# QUALITY-08 · Retroalimentación, quejas y señales

> **VC-16 · VC-22 · VC-30 · VC-31 · §28…§35, §84, §85**

## 1 · §30 · OBLIGATORIO · Una queja NO es una no conformidad

Es la confusión más cara de este dominio, porque las dos palabras se usan como
sinónimas en la conversación diaria y no lo son en un sistema de gestión.

- Una **queja** es un hecho: el cliente llamó y dijo que faltaban dos
  referencias.
- Una **no conformidad** es una **clasificación** que alguien decide, con las
  consecuencias que QUALITY-04 definió: causa, acción, eficacia.

Convertir lo primero en lo segundo automáticamente produce dos daños: infla el
recuento de no conformidades con hechos que nadie clasificó, y le quita a una
persona la decisión que le corresponde.

`quality_customer_feedback` **no tiene ninguna columna de clasificación**. La
prueba N1 lo verifica leyendo el cuerpo de la tabla, y la pantalla lo dice junto
al formulario de registro.

## 2 · §31 · Y tampoco abre un caso sola

Registrar una queja no crea ningún caso. Abrirlo es una decisión explícita, y a
veces la decisión correcta es responder al cliente y cerrar.

El camino completo:

```
queja registrada  →  alguien la mira  →  Crear caso  →  clasificarlo  →  NC
     (hecho)          (decisión)        (decisión)      (decisión)
```

Cada flecha es de una persona.

## 3 · §84 · El escenario, comprobado

| Momento | No conformidades | Casos |
|---|---|---|
| antes de registrar la queja | N | M |
| después de registrarla | **N** | **M** |
| después de pulsar «Crear caso» | **N** | M+1 |
| hasta que alguien clasifique el caso | **N** | M+1 |

La suite RLS lo cuenta en los tres momentos.

`quality_open_case_from_customer_feedback` abre un `work_case` con
`case_type = 'complaint'`, `origin_kind = 'customer'` y
`classification = 'pending'` — que es el valor por defecto de QUALITY-04, no una
invención de este sprint.

Y una sugerencia o una felicitación abren un caso de tipo `'issue'`, no
`'complaint'`: llamarlas queja deformaría el recuento.

## 4 · §32 · Referencias, no copias

El caso recibe hasta tres referencias: la manifestación, el cliente y la
respuesta de encuesta de la que salió. La ficha del caso puede enseñarlas sin
haberlas copiado dentro, así que no hay dos versiones del mismo dato esperando a
divergir.

**Y no se enlaza al cliente cuando la manifestación vino de una campaña
anónima.** El caso heredaría la identidad que la campaña prometió no guardar.

## 5 · §29 · La voz no se reduce a positivo/negativo

Seis tipos: `complaint` · `claim` · `suggestion` · `compliment` · `comment` ·
`other`.

Una sugerencia no es una queja, y una felicitación es información gestionable
(VC-31) que puede alimentar lo que se hace bien. Reducirlo a dos categorías
tira justo la parte que se puede aprovechar.

## 6 · §28 · Sin encuesta de por medio

La voz del cliente **no tiene que pasar por una encuesta**. Forzarlo produce
encuestas de una sola respuesta que nadie diseñó.

Se registra lo que llegó, con su fuente y su fecha: quién lo dijo (cuando se
sabe), por dónde llegó, de qué tema, con qué gravedad, y con sus palabras.

`quality_customer_feedback` no exige `response_id` ni `campaign_id`.

## 7 · §48 · Los temas

`quality_customer_topics` es el catálogo de la empresa: entrega, producto,
servicio, documentación, atención. Clasificación **humana y estructurada**: no
hace falta IA para saber de qué habla un cliente cuando quien lo atendió puede
decirlo en un desplegable.

## 8 · §34, §35 · Señales

Una satisfacción que baja es una **señal**, no una no conformidad, no un riesgo
y no una acción correctiva.

| Señal | Cuándo |
|---|---|
| `complaint_unreviewed` | una queja lleva más de siete días sin revisar |
| `campaign_closing_low_responses` | una campaña cierra con menos del 30 % — **solo si hay denominador** |
| `satisfaction_drop` | el resultado cayó más de un 15 % respecto de una medición **comparable** |
| `comparability_break` | la serie dejó de ser comparable |
| `high_detractors`, `complaints_increase`, `low_campaign_result` | reservadas |

El barrido `quality_scan_customer_voice` es idempotente —cada aviso lleva su
`dedupe_key` y las señales su índice único parcial— y **no toca nada**: la
prueba O1 lee su cuerpo y falla si aparece un `insert into work_cases`, un
`quality_risks`, un `work_actions` o cualquier `classification`.

Y una señal atendida **se cierra sola**: en cuanto la queja pasa a revisión, el
mismo barrido la resuelve. Una señal que hay que apagar a mano después de haber
hecho el trabajo enseña a ignorar las señales.

## 9 · §33 · Las acciones son las del motor

Si una queja necesita una acción formal, es una `work_action` de QUALITY-04 con
sus referencias. **No existe `quality_customer_actions`**, y una prueba falla si
apareciera.

Una recomendación escrita en una manifestación **no es** una acción hasta que
alguien decide planificarla.

## 10 · §59 · Escalamiento sin call center

No se construyó un flujo de atención con niveles, colas ni SLA. Lo que hay es lo
que un sistema de gestión necesita: un responsable —por CARGO (MDR-33)—, un
estado, una nota de lo que se hizo, y la posibilidad de abrir un caso cuando
merece tratamiento.
