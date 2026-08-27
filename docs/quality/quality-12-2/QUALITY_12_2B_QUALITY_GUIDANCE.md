# QUALITY-12.2B · La guía de autoría de Quality

## El problema que resolvía

PCR y Textiles tienen 23 estructuras y 250 secciones con guía. **Quality tenía
cero**, porque sus documentos no nacen de una plantilla: se crean a medida y el
editor compartido recibía `hint={null}`.

QUALITY-12.2A dejó preparado el alcance **`section_role`** justamente para
esto. Aquí se usa.

## Lo que NO se hizo

**No se crearon estructuras falsas para Quality.** Convertir sus documentos en
plantillas solo para que tuvieran botón «i» habría cambiado el modelo del
producto por una necesidad de la ayuda, que es exactamente al revés.

Una prueba lo vigila: la migración no contiene un solo `insert into
trazadoc_blueprints`.

---

## Los papeles de sección reales

Se inventariaron leyendo el código, no suponiendo. `DEFAULT_SECTIONS` en
`server/actions/quality-documents.ts` es lo que el producto crea al abrir un
documento controlado de Quality:

| `section_key` | Título en pantalla |
|---|---|
| `purpose` | Objetivo |
| `scope` | Alcance |
| `responsibilities` | Responsabilidades |
| `development` | Desarrollo |
| `records` | Registros |

**Cinco, ni uno más.** Sembrar un sexto habría sido inventar un documento que
el producto no crea.

## Cobertura

| | |
|---|---|
| Papeles que el producto crea | **5** |
| Papeles con guía | **5** |
| Papeles sin guía | **0** |
| **Cobertura** | **100 %** |

### La excepción, y por qué es correcta

Las secciones que una empresa **añade a mano** no reciben guía. No es un hueco:

* no son papeles, son suyas, con el título que ella eligió;
* su clave se genera por *slug* del título libre, así que el conjunto es
  abierto e impredecible;
* no hay guía genérica que pueda ayudar a redactar una sección cuyo tema solo
  conoce quien la creó.

Ofrecerles una guía de otro papel sería peor que no ofrecer ninguna. La prueba
`E3` comprueba que una sección inventada no recibe nada.

---

## Las cinco guías

### `purpose`

**Para qué existe la sección**

> Dejar claro para qué existe el documento y qué se espera conseguir al aplicarlo.

**Guía**

> Explica qué busca lograr este documento y sobre qué asunto de la organización actúa. Una o dos frases bastan: el detalle va en el desarrollo.

**Lo que no se puede inventar**

> No atribuir a la organización metas, compromisos ni resultados que no haya definido.

**Contexto que pediría revisarla:** `organization_profile, process`

### `scope`

**Para qué existe la sección**

> Delimitar a qué y a quién aplica el documento, y qué queda fuera.

**Guía**

> Indica a qué actividades, áreas, sedes o productos aplica, y di también qué NO cubre. Un alcance que no excluye nada suele estar sin decidir.

**Lo que no se puede inventar**

> No dar por incluidas sedes, líneas, procesos ni actividades que la organización no haya declarado.

**Contexto que pediría revisarla:** `organization_profile, process, document`

### `responsibilities`

**Para qué existe la sección**

> Dejar claro quién hace qué dentro de lo que el documento describe.

**Guía**

> Nombra los cargos —no las personas— y di qué le corresponde a cada uno: quién ejecuta, quién revisa, quién decide. Si un cargo no existe en la organización, primero se crea.

**Lo que no se puede inventar**

> No inventar responsables, cargos ni atribuciones. Si no está definido quién lo hace, se dice que falta definirlo.

**Contexto que pediría revisarla:** `position, process`

### `development`

**Para qué existe la sección**

> Describir cómo se hace lo que el documento regula, en el orden en que ocurre.

**Guía**

> Cuenta la secuencia real: qué se hace, en qué orden y con qué se decide continuar. Escribe lo que la organización hace hoy, no lo que debería hacer algún día.

**Lo que no se puede inventar**

> No inventar pasos, frecuencias, criterios de aceptación, métodos ni herramientas que la organización no use.

**Contexto que pediría revisarla:** `process, control, indicator, risk`

### `records`

**Para qué existe la sección**

> Enumerar qué queda como huella de que esto se hizo, y dónde vive.

**Guía**

> Lista los registros que deja esta actividad, dónde se guardan y cuánto tiempo se conservan. Un registro que nadie sabe dónde está no sirve como evidencia.

**Lo que no se puede inventar**

> No inventar registros, formatos, tiempos de conservación ni ubicaciones que no existan.

**Contexto que pediría revisarla:** `document, evidence`

---

## Cómo están escritas

**Neutrales respecto al sector.** Sirven igual a una panadería y a una empresa
de software. El vocabulario propio de cada empresa lo aporta su perfil, no la
guía.

**Breves y de autoría.** Dicen qué debería contener la sección, no qué
contiene la de esta empresa.

**Sin citar una sola norma.** Ninguna de las cinco menciona ISO 9001 ni ninguna
cláusula, y no hace falta: orientar la redacción de un «Objetivo» no requiere
invocar una norma, y hacerlo habría convertido una ayuda editorial en una
insinuación de conformidad. Las cinco quedan clasificadas como `safe`.

Es la diferencia entre:

> «Explica qué busca lograr este documento y sobre qué asunto de la
> organización actúa.»

y

> «Para cumplir ISO 9001 debe indicar el objetivo del procedimiento.»

La primera ayuda a escribir. La segunda insinúa que escribirlo acerca a un
certificado, que es falso.

**Cada una dice qué no se puede inventar**, y lo dice corto. La de
responsabilidades no repite un párrafo burocrático: dice que no se inventen
responsables y que, si no está definido quién lo hace, se diga en lugar de
suponerlo.

---

## En pantalla

El mismo componente compartido, `components/ui/section-hint.tsx`. No se creó
otro botón.

```
CPR        blueprint_section → guía de la sección de su estructura
Textiles   blueprint_section → guía de la sección de su estructura
Quality    section_role      → guía del papel de la sección
```

Una sola fuente canónica, dos formas de direccionarla, un solo componente.

## Demo, Full y Extra

**La misma regla que en 12.2A, sin excepciones para Quality.** El plan que se
comprueba es el del módulo Quality, resuelto dentro de la base:

| Plan | Qué llega |
|---|---|
| **Demo** | `has_guidance: true`, `restricted: true` y nada más |
| **Full** | la guía completa |
| **Extra** | la guía completa |

No se creó ningún atajo ni un cuarto estado. Las pruebas `E4` y `E5` lo
comprueban contra la base, y `E6` intenta abrir la puerta declarando otro
módulo.
