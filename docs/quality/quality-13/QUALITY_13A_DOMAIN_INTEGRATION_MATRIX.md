# QUALITY-13A · MATRIZ DE INTEGRACIÓN

**El corazón de 13A.** Trece dominios × quince ejes. Cada celda dice **LISTO**,
**PARCIAL**, **FALTA** o **N/A**, y la evidencia está en la fila de notas.

Leyenda de columnas: **Proc**esos · **Pos**iciones · **Doc**umentos · **Evid**encia ·
**Rie**sgos · **Obj**etivos · **Ind**icadores · **C/A** casos y acciones · **PI** partes
interesadas · **Aut**omatización · **RD** revisión por la dirección · **Int**elligence ·
**Hist** historia/`as_of` · **PDF** · **Nav**egación.

---

## 1 · La matriz

| Dominio | Proc | Pos | Doc | Evid | Rie | Obj | Ind | C/A | PI | Aut | RD | Int | Hist | PDF | Nav |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Procesos** | — | L | L | L | P | P | P | P | P | **F** | L | L | L | L | L |
| **Documentos / TrazaDocs** | L | L | — | L | P | N/A | N/A | P | N/A | L | L | L | L | L | L |
| **Objetivos** | L | L | P | P | P | — | L | P | **F** | L | L | L | P | L | L |
| **Indicadores** | L | L | P | L | P | L | — | L | **F** | L | L | L | L | L | L |
| **Casos y acciones** | L | L | L | L | L | P | L | — | P | L | L | L | P | L | L |
| **Riesgos y oportunidades** | L | L | P | L | — | P | P | L | **F** | L | L | L | L | L | L |
| **Personas y competencia** | L | L | P | L | P | N/A | P | P | N/A | L | L | L | P | L | L |
| **Proveedores** | **F** | L | L | L | P | N/A | P | L | P | L | L | L | L | L | L |
| **Voz del cliente** | **F** | L | P | L | P | N/A | P | L | P | L | L | L | P | L | L |
| **Auditorías** | L | L | L | L | P | N/A | N/A | L | **F** | L | L | L | P | L | L |
| **Revisión por la dirección** | L | L | L | L | L | L | L | L | L | L | — | L | L | L | L |
| **Automatización** | **F** | L | N/A | N/A | L | L | L | L | L | — | L | L | P | L | L |
| **Intelligence** | L | L | L | L | L | L | L | L | L | L | L | — | P | L | L |
| **Partes interesadas** | L | L | P | P | P | P | P | P | — | L | L | L | L | L | L |

**Recuento:** 130 celdas evaluables · **LISTO 78** · **PARCIAL 33** · **FALTA 9** ·
**N/A 10**.

---

## 2 · Los nueve FALTA, con evidencia

| # | Celda | Qué falta exactamente | Clase |
|---|---|---|---|
| 1 | Procesos → Automatización | No existe fuente `process` en `quality_automation_sources` (21 fuentes, 12 dominios, ninguna de proceso). No se puede escribir «proceso sin cargo propietario» | **D** |
| 2 | Objetivos → PI | Un objetivo no puede declararse respuesta a un requisito de parte interesada: `work_references.owner_kind` no admite `objective` | **A** |
| 3 | Indicadores → PI | Idem: `owner_kind` no admite `indicator` | **A** |
| 4 | Riesgos → PI | Un riesgo que nace de una parte interesada no puede decirlo desde el riesgo; solo desde la parte | **C** |
| 5 | Auditorías → PI | Una auditoría no puede tomar como criterio los requisitos de partes interesadas | **C** |
| 6 | Proveedores → Procesos | Un proveedor no declara de qué procesos es entrada. `quality_supplier_*` no tiene FK a `quality_processes` | **A/B** |
| 7 | Voz del cliente → Procesos | Una queja no dice a qué proceso apunta, aunque el caso que genere sí lo diga | **A/B** |
| 8 | Automatización → Procesos | Consecuencia de 1: ninguna señal puede tener como sujeto un proceso | **D** |
| 9 | *(transversal)* Procesos ← todo | No hay superficie que responda «qué significa esto para el proceso X»: sin vista `v_quality_process_*` y sin secciones en la ficha | **B/C** |

Los cinco primeros comparten causa: **`work_references` tiene 32 propietarios y ninguno
es un objeto de planificación** —proceso, objetivo, indicador, documento—. El tejido
apunta *hacia* ellos y nunca *desde* ellos.

---

## 3 · Los PARCIAL que más pesan

| Celda | Qué pasa |
|---|---|
| Procesos → Riesgos / Objetivos / Indicadores / C-A / PI | El dato existe con `process_id`, y la ficha de proceso no lo enseña |
| Casos → Historia | Un caso no reconstruye su estado a una fecha; su historia son decisiones fechadas |
| Objetivos → Historia | `historical_mode = period`, no `as_of`: no se reconstruye «qué objetivos regían el 30 de junio» |
| Auditorías → Historia | Igual: `period`. El informe emitido sí es inmutable |
| Personas → Historia | Competencia y conocimiento son `current`; la matriz sí tiene `as_of` |
| Voz del cliente → Historia | `period`. Correcto para campañas; insuficiente para «qué sabíamos entonces» |
| PI → Riesgos / Objetivos / Indicadores | Enlazables por `work_references` desde la parte, pero **manualmente y en un solo sentido** |
| Automatización → Historia | Una señal es `current`; su ejecución sí es inmutable |
| Intelligence → Historia | Cada fuente respeta su modo; **ninguna consulta compone dos dominios** |

---

## 4 · Los N/A, y por qué no son huecos

- **Objetivos e indicadores** para documentos, personas, proveedores, clientes,
  auditorías: medir un dominio con un indicador propio ya se hace *creando* un
  indicador que apunta al proceso. Duplicar el eje sería inventar dos verdades.
- **PI** para documentos, personas y automatización: una parte interesada no tiene
  relación directa con un documento interno ni con una regla; la tiene con el requisito,
  y el requisito con el proceso.
- **Evidencia y documentos** para automatización: una señal no se documenta; se
  resuelve, y lo que se documenta es la acción.

---

## 5 · Lo que la matriz dice, en una frase

**El sistema está integrado por dominios y desintegrado por procesos.** Las trece
piezas hablan con la Revisión por la Dirección, con Intelligence y con el motor de
casos; casi ninguna habla con el proceso al que pertenece, aunque casi todas sepan cuál
es.
