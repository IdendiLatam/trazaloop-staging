# QUALITY-08 · Privacidad, permisos y aislamiento

> **§62, §63, §64, §65, §99**

## 1 · §62 · Tres capacidades, no una

La voz del cliente contiene información sensible **comercialmente**, y no toda
la misma. Diseñar una encuesta no es lo mismo que leer los comentarios
individuales de una campaña.

| Capacidad | Quién | Para qué |
|---|---|---|
| `quality_manages_customer_voice` | admin · quality · **consultant** | diseñar, capturar, invitar, atender |
| `quality_reads_customer_voice` | cualquier miembro | leer resultados y quejas |
| `quality_closes_customer_voice` | admin · quality | **cerrar el periodo** y reabrir una campaña |

El consultor externo acompaña la implantación y puede hacer casi todo. Lo que no
puede es **cerrar el periodo de satisfacción**: es una afirmación de la empresa
sobre sus clientes, y no la firma alguien de fuera.

## 2 · Deny-by-default en las catorce tablas

| Capa | Regla |
|---|---|
| Lectura | `is_org_member(organization_id)` |
| Escritura general | `quality_manages_customer_voice` |
| **Respuestas y answers** | **solo `select`** — se crean por RPC |
| **Resultados de métrica** | **solo `select`** — se calculan por RPC |
| Invitaciones | `select` por columnas (sin el hash) + `update` de estado |
| Señales | `select` + `update` — se atienden, no se fabrican |

## 3 · §65 · La ausencia que sostiene el anonimato

No hay política de `insert`, `update` ni `delete` sobre
`quality_survey_responses` ni `quality_survey_answers`. **La ausencia es la
medida.**

Con una política de escritura, cualquiera con rol podría insertar una respuesta
«anónima» con el cliente puesto, y la promesa dependería de que la aplicación se
acordara. Sin ella, la única puerta es la RPC, que decide la identidad según el
modo de la campaña.

La clave de servicio tampoco tiene privilegios sobre esas tablas. La suite lo
comprueba intentando escribir con ella.

## 4 · Los privilegios, revocados primero

El proyecto concede privilegios por defecto sobre cada tabla nueva, y entre
ellos va `truncate`, **que se salta la RLS entera**. Por eso la migración revoca
todo —incluido a `authenticated`— antes de conceder exactamente lo que cada
tabla necesita.

`anon` no toca ninguna tabla del dominio: su única puerta son las dos RPC
públicas. Verificado en Staging: `anon_sobre_dominio = 0`.

Y las **vistas** se conceden aparte de sus tablas. `security_invoker` decide qué
filas devuelve la vista; el privilegio decide si se puede consultarla, y sin él
la aplicación recibe «permission denied» aunque la RLS fuera perfecta. Fue uno
de los defectos que encontró la suite.

## 5 · §66 · El hash del token no sale de la base

`grant select` sobre `quality_survey_invitations` es **por columnas**, y
`token_hash` no está entre ellas. Ni quien administra la empresa puede leerlo.
La suite lo comprueba pidiéndolo y recibiendo un error.

## 6 · §64 · Las funciones definer

**Todas** fijan `set search_path = public`. Y ninguna se fía del
`p_organization_id` que le manden:

- las que reciben un **identificador de fila** derivan la empresa de la fila y
  después comprueban el permiso — ninguna acepta la empresa como parámetro;
- las tres que sí reciben `p_organization_id` (las históricas y el barrido)
  comprueban `is_org_member` **antes** de mirar nada.

Dos exenciones, declaradas y comprobadas por la prueba:

- **predicados de permiso** — devuelven si QUIEN LLAMA tiene un papel, y
  `has_org_role` ya lo resuelve contra la sesión;
- **ayudantes internos** (`quality_customer_notice_recipient`, los dos
  dictámenes de eliminación) — tienen `execute` revocado a `authenticated`, así
  que ningún cliente puede llamarlos.

El hallazgo de QUALITY-06 no se repite.

## 7 · §99 · Los ataques, ejecutados

El bloque L de la suite RLS los corre con una segunda empresa real y los
identificadores de la primera:

| Ataque | Resultado |
|---|---|
| leer las 14 tablas filtrando por la empresa ajena | 0 filas en todas |
| leer las 3 vistas | 0 filas |
| `quality_survey_version_on` con datos ajenos | vacío |
| `quality_survey_version_structure` con datos ajenos | `null` |
| lanzar el barrido de otra empresa | error |
| pedir el dictamen de eliminación de un cliente ajeno | `not_found` |
| escribir una queja en la empresa ajena | error |
| crear una encuesta en la empresa ajena | error |
| emitir un enlace de una campaña ajena | error |
| cerrar el periodo de otra empresa | error |
| insertar una respuesta directamente | error |
| inventar un resultado de métrica | error |

Y el bloque G los de la **puerta pública**: token inventado, campaña en
borrador, campaña cerrada, enlace caducado, enlace revocado y replay. Todos
denegados, todos con el mismo mensaje.

## 8 · §46 · Comentarios y datos personales

Un comentario libre puede contener datos personales que quien escribe puso sin
pensarlo. Se leen con el mismo permiso que el resto del dominio y **nunca** se
usan para reidentificar. En una campaña anónima se imprimen sin atribución y
solo cuando hay respuestas suficientes (§45).

## 9 · §64 · Y una comprobación que casi se pierde

Reescribir `quality_deletion_eligibility` para añadir dos entidades hizo caer,
en el borrador, dos comprobaciones heredadas: la de sesión y la de QUALITY-06
que impide que quien no puede ver una ficha de persona se entere de cuánta
historia tiene.

Lo detectó la suite RLS de QUALITY-06 en la regresión, no una prueba de este
sprint. Están restauradas, y ahora la suite pura de QUALITY-08 las defiende
explícitamente para que no vuelva a pasar.
