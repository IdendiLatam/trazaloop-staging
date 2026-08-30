# QUALITY-13A.1 · REVISIÓN HUMANA Y CONGELACIÓN FINAL

Tres decisiones tomadas, una corrección aritmética que hubo que hacer, y cuatro
direcciones congeladas. Solo documentación: Local **0151** · Staging **0151** ·
Production **0111**.

---

## 1 · La corrección de la matriz

El informe de 13A decía «13 dominios × 15 columnas = 130 celdas · 78 LISTO · 33 PARCIAL ·
9 FALTA · 10 N/A».

**Estaba mal, y de tres maneras distintas.** No cuadraba consigo mismo —13 × 15 son 195,
no 130—, no cuadraba con la tabla publicada, y los cuatro estados sumaban 130 porque se
eligieron para sumar 130. Fue un resumen escrito de memoria sobre una tabla que decía
otra cosa.

Se corrigió **contando la tabla**, no ajustando las cifras:

| | Informe de 13A | Auditado |
|---|---|---|
| Filas de dominio | 13 | **14** |
| Ejes | 15 | 15 |
| Celdas totales | 130 | **210** |
| Diagonal, no clasificada | — | **10** |
| Celdas clasificadas | 130 | **200** |
| LISTO | 78 | **138** |
| PARCIAL | 33 | **43** |
| FALTA | 9 | **8** |
| N/A | 10 | **11** |

Y las dos discrepancias de fondo, explicadas en vez de disimuladas:

**Catorce filas para trece dominios.** *Objetivos* e *indicadores* son un dominio en el
inventario —comparten menú y sprint— y **dos filas** en la matriz, porque su perfil de
integración es distinto: el indicador tiene fuente de automatización propia y modo
`as_of`; el objetivo no tiene fuente y su modo es `period`. Fundirlos habría escondido
justo la diferencia que hace falta ver.

**Ocho celdas FALTA para nueve huecos.** El noveno —«no hay superficie que responda qué
significa esto para el proceso X»— **no es una celda**: es la consecuencia transversal de
las otras ocho. Sigue siendo el hueco más importante del sistema y sigue sin caber en una
casilla.

**Después** de aplicar la decisión 1 de esta revisión, dos celdas pasan de FALTA a
PARCIAL, y el recuento final es:

> **200 celdas clasificadas · LISTO 138 · PARCIAL 45 · FALTA 6 · N/A 11**
> `138 + 45 + 6 + 11 = 200` · `200 + 10 diagonales = 210` · `14 × 15 = 210`

El método de recuento está publicado en la matriz para que cualquiera lo repita. **Si la
tabla y el resumen divergieran, manda la tabla.** La comprobación automática se añade en
QUALITY-13B1, cuando el repositorio vuelva a admitir código; hoy no, porque 13A.1 es
solo documentación.

---

## 2 · Decisión 1 · Proveedor→proceso y queja→proceso

**No se crean relaciones core nuevas.** Ni `supplier_processes`, ni
`complaint_processes`, ni equivalentes.

La relación se **deriva** de lo que ya es cierto: el proveedor se conecta al proceso por
lo que suministra —su alcance, sus incidentes, el caso que lo toca—; la queja, por el
caso que genera, que sí declara sus procesos. Y si en algún punto hiciera falta
declararla explícitamente, se declara con el mecanismo transversal
—`work_references`— y no con estructura nueva.

**Por qué es la decisión correcta.** Una tabla `supplier_processes` sería una segunda
verdad, mantenida a mano, que se separaría de la primera en cuanto cambiara un alcance.
Crear estructura para simplificar una pantalla es exactamente cómo nacen los datos que
nadie actualiza.

**Cuándo se reabre:** solo si aparece un caso real que no se pueda ni derivar ni expresar
como enlace periférico. Y con la salvedad de siempre: si la relación necesitara
**vigencia propia**, dejaría de ser periférica y la conversación sería otra (QI-13).

→ **QI-23 (nueva)**, QI-03 ampliada, G-05 reescrito, dos celdas reclasificadas.

---

## 3 · Decisión 2 · La colisión de «Desempeño»

**El grupo de navegación pasa a llamarse «Evaluación».** La entrada de Personas
**conserva «Desempeño»**, que es su nombre propio y describe lo que esa pantalla hace.

Y **no** se llama «Evaluación del desempeño». Poner el título literal del capítulo 9
metería el numeral en la navegación por la puerta de atrás, y el principio congelado dice
lo contrario: la navegación operativa está desacoplada de los numerales. «Evaluación»
dice lo que se hace ahí —mirar si el sistema funciona— sin pedirle a nadie que recuerde
un número.

Auditorías y Revisión por la dirección **no** se mudan dentro de «Evaluación»: eso sería
la reorganización por capítulos que 13A rechazó, y no resuelve ningún hueco.

→ **QI-25 (nueva)**, N-02 reescrita.

---

## 4 · Decisión 3 · Tarea propia de dominio ≠ acción transversal

Aprobado, y **generalizado a todo el sistema**, no solo a Personas:

> `work_actions` se usa cuando hay una **acción transversal explícita** que gestionar
> conforme a AC-01…AC-35. Una capacitación, una verificación de eficacia o una actividad
> de desarrollo pueden seguir siendo objetos de su dominio.
>
> Pueden **relacionarse** con una acción transversal cuando corresponda. **No se duplican
> automáticamente.**

Duplicar por sistema convertiría la bandeja de acciones en un calendario de formación, y
haría irreconocible lo que de verdad es una acción correctiva.

→ **QI-24 (nueva)**, QI-15 pasa a ser su primera aplicación, G-09 reescrito.

---

## 5 · Portada de Quality · congelada

Responde **«¿qué requiere atención?»**, nunca «cuántos formularios hay».

- El modelo de atención es **derivado**. **No** se crea una sexta tabla: ya hay cinco
  verdades y ocho barridos; una tabla más sería la sexta.
- **Convergencia sobre lo que existe**, con `supersedes_observer`, que es el mecanismo
  que QUALITY-11.1 dejó construido y que hoy usan dos plantillas de ocho.
- **Cada punto navega a su causa.** Una línea que dice «3 vencidas» y no lleva a ninguna
  de las tres es una cifra, no un aviso.
- **Deduplicación por sujeto**, no por dominio: el mismo problema visto por el estado del
  dominio, por una señal, por una regla y por un caso es **un** problema.
- **Completitud administrativa no se llama desempeño.**

→ QI-07…QI-11 vigentes, **QI-26 (nueva)**.

---

## 6 · Mirador de proceso · congelado

**Proceso** es el eje primario de integración; **cargo**, el secundario.

El patrón es uno solo:

```
resumen / contexto  →  recuento y estado  →  enlace profundo al dominio dueño
```

«Riesgos abiertos: 3 → Ver riesgos». **El mirador no replica ningún dominio**: no vuelve
a construir el editor de riesgos dentro de la ficha del proceso. Cada dominio sigue
siendo dueño de su edición.

Y solo se muestran relaciones con **semántica real**: no se fuerza `process_id` donde
QI-03 lo prohíbe.

→ QI-01, QI-02, QI-03 y QI-04 (modificada).

---

## 7 · Convergencia de la atención · congelada

El inventario completo —qué es fuente de verdad, qué es observador, qué está relevado,
qué es barrido heredado y cuál es el destino de cada pieza— está en
`QUALITY_13A_INTEGRATION_DISCOVERY.md` §4.bis.

**Ningún barrido se borra sin análisis de compatibilidad.** Se releva, se comprueba que
la empresa recibe lo mismo, y solo entonces se plantea retirarlo.

→ **QI-27 (nueva)**.

---

## 8 · Intelligence y tiempo · congelados

**QI-28:** las fuentes de dominio permanecen. QUALITY-13 podrá **componer** varias en
servidor, y cada fragmento conserva su procedencia, su clase de privacidad, su modo
temporal y su frontera de permiso. No hay fuente «global» que lea por encima de los
dominios. Nada de esto se implementa en 13A.1.

**QI-29:** no todos los dominios necesitan el mismo modelo temporal, y no lo van a tener.
Pero toda integración declara si presenta **CURRENT**, **AS_OF** o **PERIOD**, y un dato
actual dentro de una vista histórica va **etiquetado o no va**.

---

## 9 · Experiencia de plataforma · sigue fuera, y sigue viva

Fuera de QUALITY-13: selector global con Quality arriba y PCR/Textiles/Construcción
debajo · ayuda «i» global enriquecida · tutorial por página · carga de tutoriales desde
Superadmin · vídeo de bienvenida · FAQ · planes y precios · pasarela de pagos · Full
autoservicio · Extra con tickets funcionales y prioritarios.

**No se pierden.** QUALITY-13 solo tiene que dejarles ganchos estables:

| Requisito futuro | Gancho que QUALITY-13 debe respetar |
|---|---|
| Ayuda «i» global | el componente compartido y el patrón de partes interesadas —constante de dominio, sin puerta comercial— |
| Tutorial por página | la **ruta** como clave estable; el inventario ya está |
| Selector global | la navegación interna de Quality lista y autónoma |
| Full / Extra | el límite comercial se pregunta al guard de módulo; **nada** en el dominio asume que Full = Extra |

---

## 10 · Delta de decisiones

| | Estado |
|---|---|
| **Nuevas** | QI-23, QI-24, QI-25, QI-26, QI-27, QI-28, QI-29 |
| **Modificadas** | QI-03, QI-04, QI-09, QI-15 |
| **Sin cambios** | QI-01, QI-02, QI-05, QI-06, QI-07, QI-08, QI-10, QI-11, QI-12, QI-13, QI-14, QI-16, QI-17, QI-18, QI-19, QI-20, QI-21, QI-22 |

Sin renumerar nada. **29 decisiones de integración**, cero conflictos con las trece
líneas de dominio congeladas.
