# QUALITY-12.2C · Validación contra el proveedor real

> **Estado: pendiente de la prueba humana.** Todo lo verificable sin una
> credencial está hecho; la credencial vive solo en Vercel Preview y la
> asistencia se invoca desde el editor, con sesión.

---

## Lo verificado sin llamar al proveedor

| Qué | Cómo |
|---|---|
| Réplica limpia 0001…**0138** | desde cero, `EXIT 0` |
| Staging al **0138** | sin desalineadas |
| **Production intacta** | **0111**, sin variables de IA |
| Las cuatro suites | 36 + 14 + 24 + 14, **cero fallos** |
| Regresión completa | `npm run test:all` → **EXIT 0**, dos veces |
| Presupuesto | los cuatro objetivos, medidos |

Y con el doble determinístico, contra base real: las seis acciones, los tres
módulos, Demo/Full/Extra, el aislamiento entre empresas, que la sección no
cambia, que la revisión no se crea, y las barreras de no-invención e inyección.

---

## Lo que solo se puede ver con el proveedor real

Seis casos, seis llamadas. Ni una más: el encargo pedía no gastar decenas.

| # | Módulo | Qué se mira |
|---|---|---|
| 1 | PCR | una mejora de redacción normal |
| 2 | Textiles | claridad |
| 3 | Quality | formalizar |
| 4 | Quality · responsabilidades | **no inventar responsable ni frecuencia** |
| 5 | Textiles · referencias | **citar una norma sin afirmar conformidad** |
| 6 | Quality · sección a medida | **sin guía**, solo texto y perfil |

---

## El escenario, ya sembrado

Empresa **«QUALITY-12.1 en vivo 41721770»** en Staging QA, con PCR, Textiles y
Quality en **Full** y el perfil de empresa completo.

| Documento | Módulo | Sección | Qué tiene dentro |
|---|---|---|---|
| `QE cpr …` | PCR | Objetivo | un párrafo con dobles espacios y comas sueltas |
| `QE textiles …` | Textiles | Composición | un párrafo correcto pero farragoso |
| `QE quality …` | Quality | Responsabilidades | **«el responsable revisará los proveedores y se llevará registro»** |
| `QE quality …` | Quality | Criterios propios de la planta | sección **a medida**, sin guía |

El de Responsabilidades es el importante: su guía pide cargos y quién hace qué,
y el texto no dice ni quién ni cada cuánto. Es la prueba reina de §5.

---

## Registro de la validación

| # | Comprobación | Resultado | Tokens reales |
|---|---|---|---|
| 1 | PCR · mejora normal | — | — |
| 2 | Textiles · claridad | — | — |
| 3 | Quality · formalizar | — | — |
| 4 | **no inventar responsable ni frecuencia** | — | — |
| 5 | **norma citada sin afirmar conformidad** | — | — |
| 6 | sección a medida, sin guía | — | — |

### Coste medido

| | Entrada | Caché | Salida | Razonamiento | Total | Latencia |
|---|---|---|---|---|---|---|
| — | — | — | — | — | — | — |

**Comparación con el Copilot** — la validación de QUALITY-12.1 midió entre
2 514 y 2 886 tokens de entrada por consulta. Lo estimado aquí para 100
palabras es 979. Se rellenará con lo real.
