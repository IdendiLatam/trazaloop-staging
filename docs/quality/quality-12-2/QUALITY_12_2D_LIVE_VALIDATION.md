# QUALITY-12.2D · Validación con el proveedor real

> **Estado: pendiente de la validación humana.**
> Este documento se completa con los números reales de Staging cuando las tres
> pruebas se hayan hecho.

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

## F · Lo que se rellenará después

<!-- Con los datos reales de Staging tras la validación humana. -->

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
