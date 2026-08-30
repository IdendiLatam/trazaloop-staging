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
| **Proveedores** | P | L | L | L | P | N/A | P | L | P | L | L | L | L | L | L |
| **Voz del cliente** | P | L | P | L | P | N/A | P | L | P | L | L | L | P | L | L |
| **Auditorías** | L | L | L | L | P | N/A | N/A | L | **F** | L | L | L | P | L | L |
| **Revisión por la dirección** | L | L | L | L | L | L | L | L | L | L | — | L | L | L | L |
| **Automatización** | **F** | L | N/A | N/A | L | L | L | L | L | — | L | L | P | L | L |
| **Intelligence** | L | L | L | L | L | L | L | L | L | L | L | — | P | L | L |
| **Partes interesadas** | L | L | P | P | P | P | P | P | — | L | L | L | L | L | L |

---

## 1.bis · Recuento, auditado y verificable

El resumen de QUALITY-13A decía «13 dominios × 15 = 130 celdas · 78 · 33 · 9 · 10».
**Estaba mal en todos sus números.** Ni cuadraba consigo mismo —13 × 15 son 195, no
130— ni con la tabla de arriba. Se corrige contando la tabla, no ajustando las cifras.

**Cómo se cuenta**, y cualquiera puede repetirlo: se toma **la tabla de la sección 1** —y
solo esa—, se cuenta una fila por dominio y quince celdas por fila, y se suma el símbolo
de cada celda. Ninguna otra tabla de este archivo entra en el recuento.

| | |
|---|---|
| Filas de dominio | 14 |
| Ejes evaluados | 15 |
| Celdas totales | 210 |
| Diagonal (`—`, un dominio consigo mismo: no se clasifica) | 10 |
| Celdas clasificadas | 200 |
| LISTO | 138 |
| PARCIAL | 45 |
| FALTA | 6 |
| N/A | 11 |

`138 + 45 + 6 + 11 = 200` · `200 + 10 = 210` · `14 × 15 = 210`. Cuadra por los tres
lados.

### Las dos discrepancias del informe anterior, explicadas

**«13 dominios» frente a 14 filas.** El inventario cuenta *Objetivos e indicadores* como
un dominio —comparten menú y sprint— y la matriz los evalúa en **filas separadas**,
porque su perfil de integración es distinto: un indicador tiene fuente de automatización
propia y modo `as_of`; un objetivo no tiene fuente propia y su modo es `period`.
Mezclarlos habría escondido esa diferencia. **Trece dominios, catorce filas**, y ahora
está dicho.

**«9 FALTA» frente a 8 celdas.** La tabla de huecos listaba nueve entradas, y la novena
—«Procesos ← todo: no hay superficie que responda qué significa esto para el proceso
X»— **no es una celda**: es la consecuencia transversal de las otras. Sigue siendo el
hueco más importante y sigue sin ser una casilla.

### Efecto de las decisiones humanas de 13A.1

Dos celdas cambian de **FALTA** a **PARCIAL** —*Proveedores → Procesos* y *Voz del
cliente → Procesos*— porque la decisión humana es **no** crear la relación core y
derivarla de lo que ya existe. Deja de ser un hueco de modelado y pasa a ser una
relación derivable, que es otra cosa. Las cifras de arriba **ya lo incluyen**; antes de
la decisión eran **LISTO 138 · PARCIAL 43 · FALTA 8 · N/A 11**, que es el recuento
auditado de la matriz tal como la dejó 13A.

> Si esta tabla y este recuento llegaran a divergir, **manda la tabla**. Cuando
> QUALITY-13B1 abra el repositorio a código, la comprobación se automatiza: se recuenta
> el archivo y se compara con este bloque. Hoy no se añade porque 13A.1 es solo
> documentación.

---

## 2 · Los seis FALTA, con evidencia

| # | Celda | Qué falta exactamente | Clase |
|---|---|---|---|
| 1 | Procesos → Automatización | No existe fuente `process` en `quality_automation_sources` (21 fuentes, 12 dominios, ninguna de proceso). No se puede escribir «proceso sin cargo propietario» | **D** |
| 2 | Objetivos → PI | Un objetivo no puede declararse respuesta a un requisito de parte interesada: `work_references.owner_kind` no admite `objective` | **A** |
| 3 | Indicadores → PI | Idem: `owner_kind` no admite `indicator` | **A** |
| 4 | Riesgos → PI | Un riesgo que nace de una parte interesada no puede decirlo desde el riesgo; solo desde la parte | **C** |
| 5 | Auditorías → PI | Una auditoría no puede tomar como criterio los requisitos de partes interesadas | **C** |
| 6 | Automatización → Procesos | La otra cara de 1: ninguna señal puede tener como sujeto un proceso | **D** |

**Y un séptimo que no es una celda.** *Procesos ← todo*: no hay superficie que responda
«qué significa esto para el proceso X» —sin vista `v_quality_process_*` y sin secciones
en la ficha—. Es la consecuencia transversal de los seis, sigue siendo el hueco más
importante, y no cabe en una casilla.

**Dos que dejaron de ser FALTA en 13A.1.** *Proveedores → Procesos* y *Voz del cliente →
Procesos* pasan a **PARCIAL** por decisión humana: no se crean `supplier_processes` ni
`complaint_processes`, la relación se **deriva** de lo que ya existe —lo que el proveedor
suministra, el caso que la queja genera— y, si hace falta declararla, se expresa como
enlace periférico. Ver QI-23.

Los cuatro del medio comparten causa: **`work_references` tiene 32 propietarios y ninguno
es un objeto de planificación** —proceso, objetivo, indicador, documento—. El tejido
apunta *hacia* ellos y nunca *desde* ellos. Es lo que resuelve QI-12.

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
| Proveedores → Procesos | Derivable por lo que suministra; sin declaración explícita ni superficie que la enseñe (QI-23) |
| Voz del cliente → Procesos | Derivable por el caso que genera la queja; el enlace directo no existe y no se va a crear (QI-23) |

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
