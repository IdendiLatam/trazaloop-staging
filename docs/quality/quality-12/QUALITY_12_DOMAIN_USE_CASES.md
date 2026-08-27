# QUALITY-12 · Casos de uso por dominio

## 1 · Los siete casos de uso

Cada uno tiene su **plantilla de instrucciones versionada** y su contexto.
No es un chat genérico con distintos nombres: la política y el material cambian.

| Caso | Plantilla | Qué hace |
|---|---|---|
| `ask` | `copilot.ask` v1 | pregunta abierta sobre lo autorizado |
| `explain_signal` | `copilot.explain_signal` v1 | traduce una señal de QUALITY-11 a lenguaje de negocio |
| `root_cause` | `copilot.root_cause` v1 | hipótesis de causa, preguntas y evidencia que falta |
| `risk_candidates` | `copilot.risk_candidates` v1 | riesgos que podrían no estar registrados |
| `review_summary` | `copilot.review_summary` v1 | borrador de resumen ejecutivo para la dirección |
| `audit_prep` | `copilot.audit_prep` v1 | focos y preguntas para una auditoría |
| `customer_themes` | `copilot.customer_themes` v1 | temas recurrentes en la voz del cliente |

## 2 · Copilot global (§47, §50, §113)

`/quality/copilot`. No es un cuadro vacío: ofrece cinco preguntas de arranque.

> «¿Qué requiere atención esta semana?»
> «Resume los principales cambios del último trimestre.»
> «¿Qué acciones están vencidas y de qué van?»
> «¿Qué debería revisar antes de la próxima auditoría?»
> «Resume los principales temas que están planteando los clientes.»

Para «qué requiere atención», el contexto prioriza lo estructurado: **señales
abiertas de QUALITY-11**, acciones vencidas y cambios recientes. No se le pide
al modelo que revise la base entera: se le da lo que el sistema determinístico
ya detectó.

## 3 · Copilot contextual (§48, §49)

Un botón «Preguntar al Copilot» en la ficha de la entidad, que abre **la misma
pantalla** con el contexto fijado. No hay siete chats distintos: hay un motor y
un enlace.

| Entidad | Texto del botón | Caso de uso por omisión |
|---|---|---|
| Señal | «Explicar con Copilot» | `explain_signal` |
| Proceso | «Preguntar al Copilot» | `risk_candidates` |
| Indicador | «Preguntar al Copilot» | `ask` |
| Caso | «Hipótesis con Copilot» | `root_cause` |
| Proveedor | «Preguntar al Copilot» | `ask` |
| Auditoría | «Preparar con Copilot» | `audit_prep` |
| Revisión | «Preparar resumen con el asistente» | `review_summary` |

El contexto fijado se muestra escrito —«Contexto: Proveedor ACME»— y el usuario
puede ampliar preguntando otra cosa, dentro de lo que su rol ve.

## 4 · Los usos, uno por uno

### Señal (§51, §106)
La señal ya trae regla, versión, condición evaluada y explicación. El Copilot
**no recalcula nada**: traduce por qué le importa a esta empresa y qué conviene
mirar. La lógica de QUALITY-11 no se discute.

### Proceso (§107)
Resumir desempeño, explicar sus señales, proponer riesgos que podrían faltar.

### Indicador (§108, §61)
Explicar la tendencia y resumir periodos. **Los números vienen del motor**: las
mediciones con su periodo y su evaluación las trae el adaptador. El Copilot no
recalcula fórmulas ni promedios.

### Proveedor (§109)
Resumir desempeño, comparar evaluaciones, preparar la reevaluación, proponer
preguntas. **No aprueba, no rechaza, no suspende.**

### Voz del cliente (§110, §57, §140)
Resumir comentarios y proponer temas. Los recuentos los calcula el código; el
modelo dice qué comentario va en qué tema. El anonimato se mantiene entero.

### Auditoría (§111, §53, §142)
Preparar: focos y preguntas apoyados en hallazgos anteriores, riesgos e
indicadores. **No crea hallazgos** ni concluye.

### Revisión por la dirección (§112, §52, §62)
Borrador de resumen ejecutivo. Las comparaciones entre periodos vienen
**ya restadas** del adaptador. Las conclusiones siguen siendo de la dirección:
el borrador no aprueba el acta ni crea decisiones.

### Caso / no conformidad (§54, §141)
Hipótesis nombradas como hipótesis, preguntas para validarlas y evidencia que
falta. Prohibido afirmar la causa raíz.

### Riesgos (§55)
Riesgos candidatos con su razonamiento y sus fuentes. No los crea ni los valora.

### Acciones (§56)
Borradores de acción, distinguiendo corrección de acción correctiva y de mejora
cuando se puede. No las formaliza.

## 5 · Lo que NO se hizo, y por qué

**Documentos (§63, §74).** El adaptador de revisiones documentales está
declarado en el catálogo pero no implementado. Resumir una revisión exige leer
su contenido, y hacerlo bien exige resolver el recorte por revisión exacta
(§74). Se difiere en vez de hacerlo a medias. Declarado como GAP-02.

**Sentimiento (§59).** No se implementa en esta entrega. Cuando se implemente
irá etiquetado como derivado de IA, con su modelo y su versión, nunca como un
hecho objetivo.
