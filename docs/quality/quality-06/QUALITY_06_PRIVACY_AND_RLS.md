# QUALITY-06 · Privacidad y RLS

**PC-25:** los archivos de personas tienen permisos más estrictos que los datos
organizacionales generales. Este documento dice exactamente cuánto más, por qué,
y dónde está implementado.

## 1 · Lo que había, y lo que no se inventó

La arquitectura tiene **tres roles**: `admin`, `quality` y `consultant`. No se
inventó un rol «HR»: hacerlo habría añadido un concepto que ninguna otra parte
del producto entiende, y habría dejado a las empresas existentes con un rol
vacío. Se implementa el mínimo coherente con lo que hay, y se **falla cerrado**.

## 2 · Tres círculos

| Círculo | Qué contiene | Quién lee | Quién escribe |
|---|---|---|---|
| **Estructura** | Unidades, cargos, perfiles, funciones, catálogo de competencias, escala, requisitos, conocimiento, holders, señales, transferencias, lecciones, planes de desarrollo, actividades | Cualquier miembro (`is_org_member`) | `admin` · `quality` · `consultant` |
| **Ficha de persona** | Personas, competencia demostrada, evidencia, necesidades y items **con persona**, participación, eficacia | `admin` · `quality`, **o la propia persona** | `admin` · `quality` |
| **Desempeño** | Población del ciclo, evaluaciones, líneas de evaluación | `admin` · `quality`, **o la persona evaluada** | `admin` · `quality` |

El consultor externo acompaña la implementación: construye estructura, define
competencias, registra conocimiento y lecciones. Lo que no hace es abrir la ficha
de nadie ni leer una evaluación individual. **Eso es exactamente la prueba que
pide §59**, y está en el bloque J de la suite RLS.

## 3 · Cómo se implementa

```sql
quality_manages_people(org)          -- has_org_role(org, ['admin','quality'])
quality_person_is_self(org, persona) -- persona.profile_id = auth.uid()
quality_can_read_person(org, persona)-- lo anterior, en OR
```

Las políticas de lectura de la ficha y del desempeño **no** usan
`is_org_member`: evalúan `quality_can_read_person(organization_id, person_id)`
fila a fila. Ver el organigrama no da derecho a abrir la ficha (§57), y la
separación vive en la base, no en la pantalla.

Un matiz que importa: una necesidad de desarrollo **sin persona** es una
necesidad del cargo o de la organización y la ve cualquier miembro. En cuanto
nombra a alguien, pasa al círculo de la ficha.

## 4 · Deny-by-default, y privilegios explícitos

Toda tabla nueva:

1. enciende RLS;
2. declara al menos una política de lectura y una de escritura;
3. **revoca** `all` de `anon` y `authenticated` y vuelve a conceder solo el DML
   que necesita.

El punto 3 es la lección de 0115 y 0118: una política correcta con un `GRANT`
heredado de más sigue siendo un agujero, porque RLS filtra filas pero no concede
permisos que no existían. `anon` no recibe nada: ninguna superficie de Personas
es pública.

Las cuatro vistas nuevas llevan `security_invoker = true`.

## 5 · El agujero silencioso: funciones `security definer`

Dentro de una función `security definer` el usuario efectivo es el **dueño**, así
que las vistas `security_invoker` que consulta dejan de filtrar por RLS. Una
función que recibe `p_organization_id` desde el cliente y no comprueba nada es un
túnel por debajo de todas las políticas del archivo: basta con pasar el
identificador de otra empresa.

Este defecto existió durante el desarrollo del sprint y lo encontró la propia
suite. Todas las funciones de lectura llevan ahora la comprobación **delante**, y
piden lo que corresponde a lo que devuelven:

| Función | Puerta |
|---|---|
| `quality_position_holders_on` | `is_org_member` |
| `quality_position_version_on` | `is_org_member` |
| `quality_required_level_on` | `is_org_member` |
| `quality_demonstrated_level_on` | `quality_can_read_person` |
| `quality_offboarding_report` | `quality_can_read_person` |
| `quality_scan_people_signals` | `is_org_member`, y sobre **una** empresa |
| `quality_deletion_eligibility` (persona) | `quality_can_read_person` |

Ninguna dice «no puedes»: devuelven vacío. Confirmar que un identificador existe
en otra empresa ya es información.

Una prueba estática recorre el archivo, encuentra toda función `security definer`
que reciba `p_organization_id` y esté concedida a `authenticated`, y exige que su
cuerpo compruebe algo.

## 6 · Cross-tenant

El bloque K de la suite RLS ataca con sesiones reales de otra empresa:

- lectura de las once tablas, por `organization_id` y **por UUID conocido**;
- lectura a través de las cuatro vistas derivadas;
- `INSERT`/`UPDATE`/`DELETE` directos por PostgREST;
- relaciones cruzadas: una persona de B asignada a un cargo de A, una
  competencia de B exigida por un cargo de A, una referencia de A a una persona
  de B;
- las RPC del dominio con identificadores ajenos;
- las funciones `security definer` con la empresa ajena en el parámetro.

Todo se rechaza o devuelve vacío. Y ni la sesión propia puede fabricar tareas ni
alertas a mano: eso lo escribe el motor.

## 7 · El PDF no concede permisos

Cada adaptador de exportación lee por las **mismas** funciones que la pantalla, y
esas pasan por RLS con la sesión de quien descarga. Si RLS no entrega la
evaluación, el adaptador recibe `null` y el endpoint responde 404 — exactamente
igual que si no existiera.

Además, el listado de personas **no imprime** correo, fechas de vinculación ni
notas: que un dato esté en la base no es razón para ponerlo en un papel que se
reenvía. Y las fichas llevan un aviso explícito de que un PDF no lleva consigo
los permisos que lo produjeron.

## 8 · Lo que este dominio no guarda

Salario, cuentas bancarias, información médica, religión, orientación sexual,
información familiar e historial disciplinario. La lista vive como dato en
`FORBIDDEN_PERSON_FIELDS` y una prueba la comprueba contra el esquema real: si
alguien añade una columna «salario», la suite lo dice en voz alta. Un límite que
solo vive en la cabeza de quien lo escribió deja de existir en tres meses.
