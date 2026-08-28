# QUALITY-12.2D · Validación con el proveedor real

> **Estado: las tres pruebas humanas PASARON.**
> Faltan los números reales de consumo, que salen de una consulta de solo
> lectura sobre Staging: `QUALITY_12_2D_CLOSING_QUERY.sql`.

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

## F · Los números reales · pendientes de una consulta

No tengo acceso de lectura a los datos de Staging, y no voy a buscar
credenciales para conseguirlo. La forma limpia es una consulta de **solo
lectura**, en `QUALITY_12_2D_CLOSING_QUERY.sql`, que devuelve una sola fila
con un JSON y **no toca el texto de nadie**: ni la pregunta, ni los hallazgos,
ni un dato personal. Solo metadatos, consumo y recuentos.

| # | run id | módulo | sección | entrada | caché | salida | razona | total | ms | consultas | hechos |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | | quality | responsibilities | | | | | | | | |
| 2 | | quality | responsibilities | | | | | | | | |
| 3 | | cpr | responsables | | | | | | | | |

Y con ellos:

- entrada media, mediana, mínimo y máximo;
- el **coste fijo real** deducido, contra los 838 estimados y los 1 664 del
  Copilot;
- la reducción frente a los 2 514–2 886 del Copilot;
- **consultas** por revisión, contra los 19 adaptadores del Copilot;
- latencia, contra los 17–20 s del Context Pack global;
- si el prefijo se sirvió desde caché a partir de la segunda revisión —en
  12.2D es idéntico en todas, cosa que 12.2C no podía tener—;
- y la comprobación contra la base de que los cargos y procesos citados
  proceden del alcance estructural y de la revisión de guía canónica vigente,
  no del conocimiento libre del modelo.

---

## G · Un incidente de esta sesión, para que quede escrito

Al preparar el Preview ejecuté `vercel --prod=false --yes` creyendo que
`--prod=false` significaba «no producción». El CLI lee `--prod` como bandera
booleana: la presencia manda y el `=false` se ignora. **Desplegó a producción.**

`trazaloop.com` pasó a servir el commit `65cfba9` —código que espera hasta la
migración **0139**— sobre una base de datos que está en **0111**, en lugar del
build del 18 de agosto (`0289a8d4`, que esperaba hasta 0110).

La base de datos de Production **no se tocó**: sigue en 0111 y ninguna
migración se aplicó allí. Lo que cambió fue la aplicación servida.

Queda registrado aquí y se informó de inmediato. La regla que se saca: para un
despliegue de vista previa, `--target=preview` explícito; nunca `--prod=false`.
