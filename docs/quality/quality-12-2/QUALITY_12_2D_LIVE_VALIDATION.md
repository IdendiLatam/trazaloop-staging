# QUALITY-12.2D · Validación con el proveedor real

> **Estado: pendiente de la validación humana.**
> Este documento se completa con los números reales cuando las tres pruebas se
> hayan hecho. Lo que sigue es el guion, y lo que hay que saber antes.

---

## A · Una cosa que hay que decir primero

**No he podido hacer las cuatro llamadas técnicas del §43.**

No es un olvido ni un problema del código. Son dos razones concretas:

**1 · La revisión exige una sesión.** Se invoca desde el editor de una sección,
con la sesión de quien pregunta —la RLS de siempre decide qué se ve—. Entrar
con unas credenciales no es algo que yo pueda hacer.

**2 · El entorno del Preview está atado a la rama anterior.** Las variables de
Supabase y las de IA están en Vercel marcadas como *Sensitive* y con ámbito
`Preview (fix/quality-12-1-openai-live-provider)`. La higiene de rama que pedía
el §0 creó una rama nueva, y ese ámbito no la cubre.

He puesto en la rama nueva las dos variables **no secretas** que faltaban
—`QUALITY_AI_PROVIDER=openai` y `QUALITY_AI_MODEL=gpt-5.4-mini`—. Las de
Supabase no las he tocado: mover credenciales ajenas de un ámbito a otro es
justo lo que no debo hacer por mi cuenta.

**Qué hace falta, y es una sola cosa.** Antes de la prueba humana, en Vercel:
añadir a la rama `feature/quality-12-2d-contextual-document-review` el mismo
juego de variables de Supabase que ya tiene
`fix/quality-12-1-openai-live-provider`, y volver a desplegar.

`QUALITY_AI_API_KEY` **no** hace falta tocarla: ya está con ámbito Preview sin
rama, así que la rama nueva la hereda.

---

## B · El entorno

| | |
|---|---|
| Rama | `feature/quality-12-2d-contextual-document-review` |
| Commit | `65cfba9` |
| Local · Staging · Production | **0139 · 0139 · 0111 sin tocar** |
| Preview desplegado | `trazaloop-production-5pnlmzule-…` |
| Production | **cero variables de IA** |
| Proveedor | `openai` · `gpt-5.4-mini` · esfuerzo `low` |

Durante todo el desarrollo **no se gastó ni una llamada al proveedor**. Las 159
comprobaciones corren contra el doble determinístico.

---

## C · Las tres pruebas

Tres, no dieciocho. Cada una demuestra una cosa que las demás no pueden.

Antes hay que tener, en la empresa de pruebas de Staging, **con Quality en
Full**:

| Qué | Dónde | Valor |
|---|---|---|
| Un cargo | Calidad › Personas › Cargos | `Coordinador de Compras` |
| Otro cargo | ídem | `Coordinador de Calidad` |
| Un proceso | Calidad › Procesos | `Gestión de compras`, con revisión publicada |
| Un control | Calidad › Riesgos › Controles | `Evaluación de proveedores`, frecuencia **anual**, ligado al proceso |
| Un documento de Quality | TrazaDocs | responsable = **Coordinador de Compras**, ligado al proceso `Gestión de compras` |
| Un documento de PCR | TrazaDocs · PCR | de la estructura `procedimiento_produccion`, responsable = **Coordinador de Compras**, ligado al mismo proceso |

---

### PRUEBA 1 · Un conflicto real, detectado

**Dónde:** el documento de **Quality**, sección con papel **Responsabilidades**.

**Pega exactamente esto:**

```
El Coordinador de Calidad revisará y aprobará las evaluaciones de los
proveedores aprobados, y dejará constancia de cada revisión.
```

**Pulsa** `Revisar consistencia` → `Revisar contra Trazaloop`.

**Qué tiene que salir:**

- un hallazgo **«No coincide con lo registrado»**, en rojo;
- **Tu texto dice:** algo con «Coordinador de Calidad»;
- **Trazaloop tiene registrado:** «Responsable registrado de este documento:
  cargo *Coordinador de Compras*»;
- un enlace **Ir a Cargo Coordinador de Compras**;
- y **el documento sin cambiar**.

**Lo que NO puede salir:** que lo haya corregido solo; que diga cuál de los dos
es el bueno; ni la palabra «no conformidad» en ninguna parte.

---

### PRUEBA 2 · Falta un dato, y no se inventa

**Dónde:** el mismo documento, misma sección.

**Reemplaza el texto por exactamente esto:**

```
Las evaluaciones de proveedores se realizan según lo previsto y se archivan en
la carpeta correspondiente del área.
```

**Pulsa** `Revisar consistencia` → `Revisar contra Trazaloop`.

**Qué tiene que salir:**

- un hallazgo diciendo que la guía pide **quién ejecuta, quién revisa y quién
  decide**, y que el texto no lo dice;
- y, muy probablemente, otro señalando que el cargo registrado —Coordinador de
  Compras— **no aparece** en el texto.

**Lo que NO puede salir, y es lo que hay que mirar con lupa:** una redacción
propuesta que **rellene** el responsable. Ni «El Coordinador de Compras
revisa…», ni un hueco tipo `[responsable]`. Debe **nombrar la ausencia** y
dejarla ahí.

---

### PRUEBA 3 · Un módulo que no es Quality

**Dónde:** el documento de **PCR**, sección **Responsables**.

**Pega exactamente esto:**

```
El Coordinador de Calidad autoriza la liberación de cada lote producido y firma
el registro correspondiente.
```

**Pulsa** `Revisar consistencia` → `Revisar contra Trazaloop`.

**Qué tiene que salir:** lo mismo que en la prueba 1 —el conflicto de cargo—
**en un documento de PCR**. El permiso vino del módulo del documento, no de
Quality.

**Prueba adicional, si quieres, y es la que más dice:** pon Quality en **Demo**
y repite esta prueba 3. Tiene que **seguir funcionando**. Y si en ese estado
abres el documento de Quality, ese sí debe decir que hace falta Full o Extra.

---

## D · Qué mirar en las tres

| | |
|---|---|
| ¿El documento cambió de estado? | **no** |
| ¿Se creó una revisión o una versión? | **no** |
| ¿Se abrió un caso o una acción? | **no** |
| ¿La sección se guardó sola? | **no** — hay que pulsar Guardar |
| ¿Aparece «no conformidad» o «cumple»? | **no debe** |
| ¿Cada hallazgo lleva su fuente, y lleva a algún sitio? | **sí** |

Si un hallazgo trae **Aplicar redacción**, pulsarlo debe cambiar solo el texto
del editor. Después hay que pulsar Guardar, como siempre.

---

## E · Lo que se rellenará después

<!-- Se completa con los datos reales de Staging tras la validación humana. -->

| # | run id | módulo | sección | entrada | caché | salida | razona | total | ms |
|---|---|---|---|---|---|---|---|---|---|
| 1 | | quality | responsibilities | | | | | | |
| 2 | | quality | responsibilities | | | | | | |
| 3 | | cpr | responsables | | | | | | |

Y con ellos:

- entrada media, mediana, mínimo y máximo;
- el **coste fijo real** deducido, contra los 838 estimados y los 1 664 del
  Copilot;
- la reducción frente a los 2 514–2 886 del Copilot;
- **consultas** y **hechos** por revisión, contra los 19 adaptadores del Copilot;
- latencia, contra los 17–20 s del Context Pack global;
- si el prefijo se sirvió desde caché a partir de la segunda revisión, que es
  la mejora estructural que 12.2D puede tener y 12.2C no;
- y la comprobación de que los tres cargos, procesos y controles citados
  proceden del alcance estructural y de la guía canónica vigente, no del
  conocimiento libre del modelo.
