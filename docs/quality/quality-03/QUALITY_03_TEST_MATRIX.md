# QUALITY-03 · Matriz de pruebas

**122 comprobaciones propias**, en tres suites que atacan el mismo dominio desde
tres alturas distintas. Más la regresión completa del repositorio.

| Suite | Qué demuestra | Local | Staging |
|---|---|---|---|
| `test:quality03` — puras y estáticas | la lógica y la migración dicen lo mismo | **53 ✔** | n/a |
| `test:quality03-rls` — base real | el comportamiento bajo RLS, con sesiones reales | **52 ✔** | **52 ✔** |
| `test:quality03-ui` — recorrido humano | una persona logra hacerlo por HTTP | **17 ✔** | **17 ✔** |

Todas con **código de salida 0**, leído explícitamente. Ninguna afirmación de
este documento se apoya en «el build pasó».

---

## 1. Puras y estáticas · 53

Sin base de datos. Comprueban la lógica del dominio y —esto es lo que las hace
valiosas— que **la migración y el código TypeScript no puedan divergir**.

**A · Las separaciones que no se difuminan (4)** — estado administrativo y
desempeño son vocabularios distintos (OI-03); un indicador activo puede no
cumplir y uno retirado haber cumplido; cero/sin dato/no aplica son tres cosas
(OI-21); la calidad del dato no es desempeño (OI-11, OI-31).

**B · Evaluación (7)** — las cuatro direcciones, el umbral, «sin meta» ≠ «no
cumple», y que cada veredicto tenga nombre y tono en español.

**C · Tendencia (7)** — subir mejora donde más es mejor; **bajar mejora donde
menos es mejor**; en rango mejorar es acercarse; una oscilación pequeña es
estable; con menos de tres datos no se afirma nada; los huecos no cuentan como
cero.

**D · Forma de la meta y de la fórmula (7)** — un rango necesita sus dos
extremos; el umbral va al lado correcto de la meta; no hay umbral sin meta; la
fórmula es un **conjunto cerrado, no un lenguaje**; dividir entre cero se niega.

**E · Unidades (3)** — todas las del encargo; la unidad es presentación y no
transforma el valor; la base escribe los números como los lee un hispanohablante.

**F · Fuentes automáticas (3)** — el catálogo del dominio y el de la **base**
dicen lo mismo; cada fuente se explica y declara su naturaleza; salen de datos
que Quality ya tiene.

**G · Permisos (1)** — definir es gobierno, medir es trabajo operativo.

**M · Migraciones 0117 y 0118 (15)** — append-only; toda tabla nueva
tenant-owned con RLS y FK compuesta; configuración versionada; medición con
linaje y meta aplicable; cero ≠ sin dato exigido por la **base**; corregir no
sobrescribe; el motor no concede escritura por política; catálogo acotado por
empresa; cierre congela y reabrir exige motivo; bajo la meta hay evento y no NC;
la bandeja se **amplía**, no se duplica; privilegios explícitos y `anon` sin
nada; las vistas heredan la RLS; la migración ancla sus decisiones OI/AT/MDR; y
**M15**, el invariante nuevo: el motor es de solo lectura también donde el
entorno concede de más.

**N · Coherencia entre capas (6)** — los enumerados del dominio y los de la base
coinciden; las dos reglas de objetivo están implementadas **y explicadas**; la
evaluación del dominio y la de la base siguen la misma regla; las server actions
no envían resultados ni evaluaciones; la pantalla nunca decide la evaluación; la
gráfica no dibuja los huecos como cero.

---

## 2. Base real · 52 · **local y Staging**

Con sesiones reales de usuarios reales. `service_role` se usa **solo** para
crear las cuentas; ninguna comprobación se hace con él.

**A · Objetivos (4)** · **B · Indicadores y direcciones (7)** ·
**C · Mediciones (7)** · **D · La historia no se reescribe (4)** ·
**E · Fuentes automáticas (7)** · **F · Desempeño del objetivo (3)** ·
**G · Medición pendiente, eventos y alertas (6)** · **H · Cierre de ciclo (4)** ·
**X · Ataques y aislamiento (7)** · **Z · Sin regresión en QUALITY-01/02 (3)**.

### Las que responden a los casos críticos del encargo

| Caso del encargo | Prueba |
|---|---|
| **A · Histórico de meta** — enero ≥90 con 92 CUMPLE; cambiar a ≥95 no lo altera | `D1`, `D2` |
| **B · Dirección** — 90→95→97 y 10→7→4 son ambas favorables | `B1`, `B2` |
| **C · Cero ≠ sin dato** | `C1`, `C2` |
| **D · Fuente automática real** — el navegador no puede introducir el valor | `E2`, `E4`, `E7` |
| **E · Alerta** — fuera de meta genera señal, **nunca** una NC | `G4` |
| **F · Cierre** — después no se reescribe meta, configuración ni medición | `H1`, `H2`, `H3` |

---

## 3. Recorrido humano · 17 · **local y Staging**

HTTP real contra formularios reales, sin JavaScript: el navegador envía
`POST`, el servidor responde. Si un formulario no existe sin JS, el paso falla.

```
 1. El selector ofrece Quality y se entra desde ahí
 2. La portada de Quality lleva a Objetivos e Indicadores
 3. Objetivos ofrece crear y lleva a Indicadores
 4. Crear el objetivo con cargo responsable y proceso relacionado
 5. Crear un indicador MANUAL con meta, unidad y periodicidad
 6. Registrar una medición: la evaluación la deriva el sistema
 7. Un segundo y un tercer periodo dan TENDENCIA
 8. Cero NO es «sin dato»
 9. Cambiar la meta NO reescribe el pasado
10. Crear un indicador AUTOMÁTICO desde el catálogo de la pantalla
11. «Calcular ahora»: el resultado sale de los datos de Quality
12. El objetivo muestra su desempeño DERIVADO y explicado
13. Revisar mediciones pendientes crea tarea y alerta
14. Un indicador fuera de meta genera alerta al responsable
15. La portada resume el desempeño con datos reales
16. Cerrar el ciclo congela los resultados
17. Quality-only: nada del recorrido depende de PCR ni Textiles
```

El paso 17 no es decorativo: la empresa del recorrido tiene **PCR y Textiles sin
acceso**. Si algo de Objetivos e Indicadores dependiera de ellos, el recorrido
entero se caería.

---

## 4. Regresión completa

### 4.1 · Local

```
npm run test:all   →  EXIT 0   ·  1 915 comprobaciones
```

Cubre QUALITY-01, 01.1, 01.2, 02, 03, PCR, Textiles, TrazaDocs, Auth,
equipo/invitaciones, selector de módulos, release v1.0.x y recuperación de
contraseña.

Suites de base real y recorridos, que no entran en la cadena de `test:all`:

| | base real | recorrido |
|---|---|---|
| QUALITY-01 | 56 ✔ | 15 ✔ |
| QUALITY-01.1 | 41 ✔ | 16 ✔ |
| QUALITY-01.2 | 33 ✔ | 16 ✔ |
| QUALITY-02 | 58 ✔ | 26 ✔ |
| QUALITY-03 | 52 ✔ | 17 ✔ |
| **total** | **240 ✔** | **90 ✔** |

Todas con exit 0.

### 4.2 · Staging

| | base real | recorrido |
|---|---|---|
| QUALITY-01 | 51 ✔ | 15 ✔ |
| QUALITY-01.1 | 37 ✔ | 16 ✔ |
| QUALITY-01.2 | 30 ✔ | 16 ✔ |
| QUALITY-02 | 58 ✔ | 26 ✔ |
| QUALITY-03 | 52 ✔ | 17 ✔ |
| **total** | **228 ✔** | **90 ✔** |

Todas con exit 0.

> Las tres suites de QUALITY-01.x muestran menos comprobaciones que en local
> porque **omiten** —y lo anuncian— las que necesitan SQL directo cuando no se
> define `SUPABASE_DB_URL`. QUALITY-02 y QUALITY-03 no usan SQL directo: sus
> cifras son idénticas en los dos entornos.

---

## 5. Lo que las pruebas encontraron y no se dejó pasar

| Hallazgo | Dónde apareció | Corrección |
|---|---|---|
| La bandeja no conocía los tipos nuevos: tareas sin etiqueta y enlaces a `/quality/documents/<id-de-indicador>` | revisión visual en navegador | se extendió el dominio de la bandeja; el destino lo decide el **tipo de asunto** |
| El eje de la gráfica bajaba a −9,6 % en un indicador de porcentajes | revisión visual | el eje no baja de cero si ningún dato es negativo |
| La etiqueta de la meta tapaba los puntos que cumplen | revisión visual | reubicada abajo a la izquierda |
| `66.67` en la base contra `66,67 %` en pantalla | revisión visual | `quality_fmt_number()` en SQL + regresión |
| Dos textos decían «organización» donde el glosario exige «empresa» | `test:all` | corregidos |
| **`authenticated` conservaba UPDATE sobre mediciones y eventos** | **suite de base real contra Staging** | **migración 0118 + invariante M15** |

El último solo era visible en Staging, y solo mediante pruebas que exigen un
**error** y no se conforman con «no pasó nada».
