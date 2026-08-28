# QUALITY-12.2D · Validación con el proveedor real

> **Estado: CERRADA.** Las tres pruebas humanas pasaron y los números reales de
> Staging están abajo. Cinco operaciones en total: tres finales y dos de la
> primera ronda, que se conservan porque enseñan algo.

---

## A · El entorno, verificado

| | |
|---|---|
| Rama | `feature/quality-12-2d-contextual-document-review` |
| Commit | `9735f8f` |
| Local · Staging · **Production** | **0139 · 0139 · 0111 sin tocar** |
| Proveedor | `openai` · `gpt-5.4-mini` · esfuerzo `low` |

**Qué recibe el Preview de esta rama** (nombres, nunca valores):

| Variable | Ámbito |
|---|---|
| `QUALITY_AI_API_KEY` `QUALITY_AI_PROVIDER` `QUALITY_AI_MODEL` `QUALITY_AI_REASONING_EFFORT` | rama |
| `NEXT_PUBLIC_SUPABASE_URL` `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` `SUPABASE_SECRET_KEY` | todas las previews |
| `ACTIVE_ORG_COOKIE_SECRET` `NEXT_PUBLIC_SITE_URL` `QUALITY_MODULE_ENABLED` `TEXTILES_MODULE_ENABLED` | todas las previews |

El código acepta los dos juegos de nombres de Supabase —`SECRET_KEY` /
`SERVICE_ROLE_KEY`, `PUBLISHABLE_KEY` / `ANON_KEY`—, así que el conjunto está
completo.

> **Corrección a lo que informé antes.** Dije que la rama nueva se quedaba sin
> variables de Supabase. Era falso: filtré la lista por rama y no vi que existe
> un juego **sin rama, para todas las previews**, con todo lo necesario. El
> Preview habría funcionado igualmente.

`QUALITY_AI_PROVIDER=openai` y `QUALITY_AI_MODEL=gpt-5.4-mini` los escribí yo
en esta sesión; su valor no se puede releer porque están marcados *Sensitive*,
pero no es una deducción: es lo que se envió.

---

## B · Por qué no hay llamadas técnicas mías

**Cero de las cuatro del §43.** No por el entorno, que ahora está bien, sino
por dos cosas que no dependen de él:

1. **La revisión exige una sesión.** Se invoca desde el editor de una sección,
   con la sesión de quien pregunta. Entrar con credenciales no es algo que yo
   pueda hacer.
2. **El Preview está tras el acceso de Vercel.** Anónimo devuelve la pantalla
   de acceso de Vercel, no la aplicación.

La alternativa —usar la credencial de OpenAI desde fuera— exigiría recuperarla,
y eso está prohibido desde QUALITY-12.1.

Así que las tres pruebas de abajo son las **primeras** llamadas reales de
12.2D. Durante todo el desarrollo no se gastó ni una: las 159 comprobaciones
corren contra el doble determinístico.

---

## C · Las dos rondas

| Ronda | Qué pasó |
|---|---|
| **Primera** | 1 PASS, 1 parcial, 1 fallo — **las dos incidencias eran fixture, no código** |
| **Segunda** | **las tres PASS** |

---

## C.1 · Primera ronda · qué pasó

| | |
|---|---|
| Prueba 1 · Quality, conflicto | **PARCIAL** — «Podría no coincidir» en vez de confirmado |
| Prueba 2 · Quality, falta información | **PASS** |
| Prueba 3 · PCR transversal | **FALLO** — «no encontré registros relacionados», 0 hechos, 1 consulta |

**Ninguna de las dos incidencias era un defecto del código.** Las dos se
reprodujeron exactamente contra base real, con el doble determinístico y sin
gastar una sola llamada al proveedor:

### Prueba 1 · faltaba el segundo cargo

| Configuración | Hechos | Observación | Resultado |
|---|---|---|---|
| «Coordinador de Calidad» **no existe** | `[1]` solo el responsable | `position_none_named` | «podría no coincidir» |
| «Coordinador de Calidad» **sí existe** | `[1]` y `[2]` | `position_differs` | **discrepancia CONFIRMADA** |

Lo que se vio en la validación —un único hecho `[1]` y «podría no coincidir»—
es la primera fila. La confirmación exige los **dos** lados registrados, y esa
regla es deliberada: sin el segundo cargo, Trazaloop no sabe si el texto nombra
otro cargo o al mismo con otras palabras. **El algoritmo no se ha tocado.**

### Prueba 3 · faltaba la relación documento↔proceso

| Configuración | Relación | Proceso | Hechos | Consultas |
|---|---|---|---|---|
| **sin** la relación | 0 filas | no | 0 | **1** |
| **con** la relación | 1 fila | sí | 3 | 7 |

«0 hechos · 1 consulta» es exactamente la primera fila: el alcance quedó vacío
y la revisión respondió sin llamar al modelo. Con la relación, la cadena
completa funciona y emite el hecho con la semántica correcta:

```
Cargo dueño del proceso «Gestión de compras»: «Coordinador de Compras».
```

**No «Responsable de este documento»**, porque PCR no tiene ese dato.

### Lo que sí se ha corregido

**El mensaje no distinguía dos problemas distintos.** «No encontré registros
relacionados» se decía igual cuando la guía de la sección no señala ningún
contexto —que no tiene arreglo— y cuando al documento le falta una relación
—que sí—. Esa ambigüedad es la que hizo que una relación ausente pareciera un
defecto de la funcionalidad. Ahora el segundo caso dice qué enlazar.

**Y aparecieron dos huecos en las pruebas, los dos reales:**

- la suite construía su fixture sin comprobarlo, y su propia revisión de
  proceso llevaba tiempo sin insertarse —el `CHECK` exige `published_at` y
  nadie miraba el error del `insert`—;
- `C3` comprobaba que con Quality en Demo la revisión de PCR «no fallaba»,
  no que **siguiera resolviendo contexto**. Un alcance vacío habría pasado.

Los dos cerrados. Y hay un comprobador de fixture: `npm run check:122d-fixture`.

---

## C · Preparación · cinco minutos

**Empresa:** «QUALITY-12.1 en vivo 41721770» · Staging QA
**Quality debe estar en Full.**

### 1 · Dos cargos

**Calidad › Personas › Cargos** → crear, con estos nombres **exactos**:

```
Coordinador de Compras
Coordinador de Calidad
```

Los dos tienen que existir. El segundo es el que aparecerá escrito en el texto,
y solo se puede **confirmar** una discrepancia cuando los dos lados están
registrados; si uno no existe, saldrá un aviso más débil y la prueba no
demuestra lo que tiene que demostrar.

### 2 · Un proceso

**Calidad › Procesos** → crear:

| | |
|---|---|
| Nombre | `Gestión de compras` |
| Cargo dueño | **Coordinador de Compras** |

Y **publicar su revisión**, para que tenga propósito registrado.

### 3 · El documento de Quality

**Calidad › Documentos** → crear un documento controlado:

| | |
|---|---|
| Título | el que quieras |
| **Cargo responsable** | **Coordinador de Compras** |

Añádele una sección con el papel **Responsabilidades**.

### 4 · El documento de PCR

**TrazaDocs › PCR** → crear uno desde la estructura
`procedimiento_produccion`. **No** tiene selector de cargo responsable, y no
hace falta: en **Calidad › Procesos › Gestión de compras › Documentos**,
enlázalo al proceso. El cargo dueño del proceso hace de referencia.

Enlaza ahí también el documento de Quality, si quieres que la revisión traiga
además el propósito del proceso.

---

## C.2 · Segunda ronda · las tres pruebas humanas PASARON

### Quality · información faltante — **PASS**

```
Las evaluaciones de proveedores se realizan según lo previsto y se archivan
en la carpeta correspondiente del área.
```

- la guía canónica detectó que faltaba definir responsabilidades;
- **no rellenó el cargo**, aunque Trazaloop conoce «Coordinador de Compras»;
- no inventó responsables ni metió marcadores de relleno;
- señaló además «la carpeta correspondiente del área» como **referencia
  ambigua** —un acierto que ninguna prueba pedía—;
- no presentó la ausencia como incumplimiento.

Es la prueba que más dice sobre la frontera del sprint: **conocer un dato no
autoriza a escribirlo en el texto de otra persona.**

### Quality · conflicto confirmado — **PASS**

```
El Coordinador de Calidad revisará y aprobará las evaluaciones de los
proveedores aprobados, y dejará constancia de cada revisión.
```

Salió **«No coincide con lo registrado» · Discrepancia**, con los dos hechos:

```
[1] Responsable registrado de este documento: cargo «Coordinador de Compras».
[2] Cargo «Coordinador de Calidad».
```

y navegación a **los dos** cargos. Queda demostrado de una vez: resolución de
entidades, identidades distintas, **ascenso determinista** a discrepancia
confirmada, procedencia, pantalla y decisión humana.

### PCR · conflicto transversal — **PASS**

```
El Coordinador de Calidad autoriza la liberación de cada lote producido y
firma el registro correspondiente.
```

**«No coincide con lo registrado» · Discrepancia**, con:

```
Cargo «Coordinador de Calidad».
Cargo dueño del proceso «Gestión de compras»: «Coordinador de Compras».
```

Y lo que hace que esta prueba valga: **no apareció** «Responsable de este
documento», porque PCR no tiene ese dato. La cadena fue

```
documento PCR → relación con proceso → Gestión de compras → cargo dueño
```

Apareció además un hallazgo separado diciendo que la guía pide otros papeles
que el texto no aborda, **sin rellenarlos**.

---

## D · Las tres pruebas

### PRUEBA 1 · Un conflicto real, detectado

**Dónde:** documento de **Quality** → sección **Responsabilidades** → el
`textarea` de la sección.

**Texto exacto:**

```
El Coordinador de Calidad revisará y aprobará las evaluaciones de los
proveedores aprobados, y dejará constancia de cada revisión.
```

**Pulsar:** `Revisar consistencia` → `Revisar contra Trazaloop`.

**Qué debe aparecer:**

| | |
|---|---|
| Hallazgo | **«No coincide con lo registrado»**, marco rojo, etiqueta «Discrepancia» |
| **Tu texto dice** | `El Coordinador de Calidad revisará…` |
| **Trazaloop tiene registrado** | `Responsable registrado de este documento: cargo «Coordinador de Compras».` |
| Fuente | botón **Ir a Cargo Coordinador de Compras** → lleva a la ficha del cargo |
| Puedes | una acción para la persona, nunca «lo corrijo yo» |

**Qué NO debe inventar:**

- **ningún cargo que no exista.** Solo pueden aparecer «Coordinador de Compras»
  y «Coordinador de Calidad»;
- **ninguna frecuencia, plazo, criterio ni registro**: nada de eso está escrito
  ni registrado;
- **ninguna decisión sobre cuál de los dos es el correcto.** Enseña los dos y
  calla;
- **ninguna palabra de conformidad ni de auditoría**: ni «cumple», ni
  «conforme», ni «no conformidad», ni «hallazgo mayor/menor».

---

### PRUEBA 2 · Falta un dato, y no se rellena

**Dónde:** el mismo documento, la misma sección.

**Texto exacto** (reemplaza el anterior):

```
Las evaluaciones de proveedores se realizan según lo previsto y se archivan en
la carpeta correspondiente del área.
```

**Pulsar:** `Revisar consistencia` → `Revisar contra Trazaloop`.

**Qué debe aparecer:**

| | |
|---|---|
| Un hallazgo | la guía pide **quién ejecuta, quién revisa y quién decide**, y el texto no lo dice |
| Probablemente otro | el cargo registrado —Coordinador de Compras— **no aparece** en el texto |
| Fuente | el cargo, en el segundo |

**Esto es lo que hay que mirar con lupa.** Si ofrece una redacción alternativa,
**no puede rellenar el responsable**:

- ni «El Coordinador de Compras revisa…» —aunque sea el registrado, el texto no
  lo dice y ponerlo sería decidir por la persona—;
- ni un hueco tipo `[responsable]` o `(indicar cargo)`.

Debe **nombrar la ausencia** y dejarla ahí.

**Qué contexto debería aparecer:** cargos y, si enlazaste el documento al
proceso, el proceso `Gestión de compras`. **Nada más**: ni proveedores, ni
auditorías, ni indicadores. La sección `Responsabilidades` declara
`{position, process}` y no debe traer un solo hecho de otro dominio.

---

### PRUEBA 3 · Un módulo que no es Quality

**Dónde:** documento de **PCR** → sección **Responsables**.

**Texto exacto:**

```
El Coordinador de Calidad autoriza la liberación de cada lote producido y firma
el registro correspondiente.
```

**Pulsar:** `Revisar consistencia` → `Revisar contra Trazaloop`.

**Qué debe aparecer:** el mismo conflicto de cargo, **en un documento de PCR**.
El permiso vino del módulo del documento, no de Quality.

**Y una diferencia que importa:** aquí el hecho debe decir

```
Cargo dueño del proceso «Gestión de compras»: «Coordinador de Compras».
```

y **no** «Responsable registrado de este documento». Los documentos de PCR no
tienen cargo responsable propio, y presentar al dueño del proceso como si lo
fuera sería afirmar algo que no está registrado.

**Prueba adicional, la que más dice:** pon **Quality en Demo** y repite esta
prueba 3. Debe **seguir funcionando**. Y si en ese estado abres el documento de
Quality, ese sí debe decir que hace falta Full o Extra.

---

## E · Qué comprobar en las tres

| | |
|---|---|
| ¿El documento cambió de estado? | **no** |
| ¿Se creó una revisión o una versión? | **no** |
| ¿Se abrió un caso, una acción o un riesgo? | **no** |
| ¿La sección se guardó sola? | **no** — hay que pulsar Guardar |
| ¿Aparece «no conformidad», «cumple» o «conforme»? | **no debe** |
| ¿Cada hallazgo lleva su fuente, y lleva a algún sitio? | **sí** |
| Al pie: hechos, consultas | debería decir pocos de los dos |

Si un hallazgo trae **Aplicar redacción**, pulsarlo cambia solo el `textarea`.
Después hay que pulsar Guardar, como siempre.

---

## F · Los números reales

Cinco operaciones `document.contextual_review` en Staging. **Tres finales** —las
que cuentan para las métricas— y **dos de la primera ronda**, que no entran en
los promedios pero se conservan porque cada una demuestra una cosa.

### Los tres runs finales

| | A · Quality falta info | B · Quality conflicto | C · PCR conflicto |
|---|---|---|---|
| run | `67538fbd…` | `d202ef94…` | `7d5f4e26…` |
| módulo · sección | quality · responsibilities | quality · responsibilities | **cpr** · responsables |
| **entrada** | **1 072** | **1 092** | **1 055** |
| caché | 0 | 0 | 0 |
| salida | 695 | 493 | 667 |
| razonamiento | 387 | 256 | 297 |
| total | 1 767 | 1 585 | 1 722 |
| latencia | 7 791 ms | 6 484 ms | 7 648 ms |
| **consultas** | **5** | **5** | **7** |
| contexto resuelto | `position` | `position` | `process` + `position` |
| hallazgos | 2 | 1 | 2 |
| tipos | `ambiguous_reference`, `guidance_gap` | **`confirmed_conflict`** | **`confirmed_conflict`**, `guidance_gap` |
| fuentes citadas | 1 | 2 | 2 |
| guía | section_role rev. 1 | section_role rev. 1 | **blueprint_section rev. 2** |

Los tres: `openai` · `gpt-5.4-mini` · `provider_called = true` · `succeeded`.

En los tres, `entrada + salida = total` exactamente. El razonamiento va dentro
de la salida.

### Promedios

| | |
|---|---|
| Entrada | **1 073** · mediana 1 072 · mín 1 055 · máx 1 092 |
| Salida | 618,33 |
| Razonamiento | 313,33 |
| Total | 1 691,33 |
| Latencia | **7 307,67 ms ≈ 7,31 s** · de 6,48 a 7,79 |
| Consultas | **5,67** · máximo 7 |
| Hallazgos | 1,67 |

---

## G · El consumo, comparado

| | Entrada media | |
|---|---|---|
| Copilot global | 2 514 – 2 886 | |
| **Revisión contextual** | **1 073** | **−57,3 %** vs 2 514 · **−62,8 %** vs 2 886 |
| Quick Edit (12.2C) | 727 | la revisión cuesta **+47,6 %** |

Ese +47,6 % es lo que vale traer hechos y citarlos. Es exactamente lo que se
compró: 12.2C mira un párrafo, 12.2D lo contrasta con la base.

### Contra el presupuesto congelado

| | |
|---|---|
| Tope normal | **≤ 1 400** |
| Peor caso humano | **1 092** |
| **Margen** | **308 tokens** |

**PASS**, y con holgura. Los criterios se escribieron antes de ver los datos y
no se han movido.

La estimación del presupuesto daba 1 277–1 382 para una revisión normal y lo
real fue 1 073: una razón de **0,84**, dentro de la banda 0,76–0,92 que dio
12.2C con la misma regla de 3,6 caracteres por token. La regla sigue siendo
conservadora, que es como debe ser.

### El coste fijo NO se deduce de aquí

El proveedor informa de la entrada **total**; no la separa entre política,
esquema y contenido. El coste fijo sigue siendo el **medido estáticamente por
las suites de presupuesto: 838 tokens**, y se mantiene como tal.

Inventar una medición «en vivo» de algo que el uso reportado no separa sería
justo la clase de número que este sprint no produce.

### La latencia subió, y se sabe por qué

**7,31 s** de media, frente a los **2,8 s** de 12.2C. No es el contexto —de
cinco a siete consultas— sino la respuesta: 618 tokens de salida de media con
313 de razonamiento, contra los ~171 y ~80 de Quick Edit. Producir hallazgos
razonados cuesta más que reescribir un párrafo.

Sigue muy por debajo de los **17–20 s** del Context Pack global.

### El caché no entró, y mi predicción era optimista

`cached_input_tokens = 0` en los tres.

El presupuesto de este sprint decía que, al ser el prefijo idéntico en todas las
revisiones, a partir de la segunda debería servirse desde caché. **Los datos no
lo respaldan** en esta muestra: las tres operaciones se repartieron a lo largo
de más de media hora —02:19, 02:21 y 02:51—, y los cachés de prefijo de los
proveedores duran minutos, no decenas de minutos.

Se corrige la predicción en vez de dejarla escrita como si se hubiera cumplido.
Medirlo de verdad exige uso continuado, y optimizarlo es **trabajo diferido**,
no un hueco de 12.2D.

---

## H · El presupuesto de consultas, confirmado al dedillo

Esto es lo que más limpio salió. Las consultas reales coinciden **exactamente**
con el modelo escrito antes de medirlas:

| | Adaptadores | Cuenta prevista | Real |
|---|---|---|---|
| Quality (sin procesos ligados) | alcance 1 + catálogo cargos 1 + catálogo procesos 1 + cargos 2 | **5** | **5** ✔ |
| PCR (con proceso ligado) | lo anterior + procesos 2 | **7** | **7** ✔ |

**No se ejecutaron diecinueve adaptadores.** Se ejecutaron los que la guía
declaró y que tenían algo que traer:

- **Quality** → `position`. La guía declara `{position, process}`, pero esos
  documentos no están ligados a ningún proceso, así que el adaptador de
  procesos no trajo nada. `related_context_types` guarda lo que **se trajo**,
  no lo que se pidió.
- **PCR** → `process` + `position`, que es la cadena entera del caso
  transversal.

---

## I · La verdad del proveedor

| | |
|---|---|
| Tres finales | `openai` · `gpt-5.4-mini` · `provider_called=true` · consumo > 0 |
| PCR sin contexto (`5328446b…`) | **`provider_called=false`** · entrada 0 · salida 0 · total 0 · 1 consulta · 514 ms |

El segundo es evidencia positiva, no un fallo: **sin hechos relacionados no se
llama al modelo y no se gasta un token.** Se conserva a propósito.

---

## J · Los dos runs de la primera ronda

No entran en los promedios. Se guardan porque cada uno prueba algo.

### `7c17eb0d…` · Quality antes de completar el fixture

entrada 1 079 · salida 515 · razonamiento 111 · total 1 594 · 5 consultas ·
1 fuente · `provider_called=true` · **0 confirmados**
tipos: `possible_conflict`, `missing_information`, `guidance_gap`

«Coordinador de Calidad» **no existía** todavía como cargo registrado, así que
`possible_conflict` era **la respuesta correcta**. No es un defecto del
algoritmo: es la regla de los dos lados funcionando.

Puesto al lado de `d202ef94…` —el mismo texto, el mismo documento, con el cargo
ya creado— se ve el ascenso determinista ocurriendo:

| | primera ronda | final |
|---|---|---|
| cargo «Coordinador de Calidad» | no existe | existe |
| fuentes | 1 | 2 |
| resultado | `possible_conflict` | **`confirmed_conflict`** |

### `5328446b…` · PCR antes de asociar el documento al proceso

1 consulta · 0 hallazgos · 0 fuentes · entrada 0 · salida 0 · total 0 ·
**`provider_called=false`** · 514 ms

El alcance estaba vacío porque faltaba la relación documento↔proceso. La
revisión lo dijo y **no llamó a nadie**.

---

## K · Lo que NO cambió en la base

**El agregado global de tres días no sirve para esto y no se usa como prueba.**
La ventana contiene actividad de QA —33 casos, 35 indicadores, 18 acciones, 16
revisiones de documento y más— que no es atribuible a la revisión contextual.
Un recuento global no demuestra causalidad, y presentarlo como «cero
escrituras» sería falso.

Lo que sí demuestra algo son las marcas de tiempo de **los documentos que se
revisaron**:

| Documento | Creado | Actualizado | Runs |
|---|---|---|---|
| **PCR** | 02:17:11.990 | **02:17:11.990** (idéntico) | 02:22:59 · 02:53:22 |
| **Quality** | 02:15:21.979 | 02:15:22.302 | 02:19:39 · 02:21:48 · 02:51:50 |

El de PCR **no se tocó nunca** desde que se creó, y sus dos revisiones fueron
después. El de Quality se actualizó 0,3 segundos después de crearse —la
preparación del fixture— y **las tres revisiones ocurrieron más tarde**. Las
secciones, igual.

Los dos siguen en **borrador**. No hubo aprobación automática. Que uno tenga
revisión vigente es estado anterior a los runs, no obra de la IA.

La conclusión defendible, y la única:

> Las revisiones contextuales no modificaron los documentos ni sus secciones.
> Las escrituras globales de la ventana de QA no son atribuibles por esta
> consulta y no se usan como prueba de causalidad.

Y se apoya en tres cosas más, que sí son demostraciones: **la arquitectura no
tiene camino de escritura de negocio** —comprobado leyendo el código en
`C6`/`C7`—, las suites de base real cuentan objetos antes y después
(`E1`, `E2`, `E3`, `E4`), y la persona vio que nada se guardaba.

---

## L · La separación del consumo

| Caso de uso | Operaciones (3 días) |
|---|---|
| `ask` | 48 |
| `customer_themes` | 5 |
| `document.quick_edit` | 4 |
| **`document.contextual_review`** | **5** |
| `root_cause` | 1 |

Cinco, que son exactamente los tres finales más los dos de la primera ronda.
La capacidad nueva se cuenta aparte del Copilot y de la asistencia de
redacción, que es lo que 12.2F necesitará para costearla.
