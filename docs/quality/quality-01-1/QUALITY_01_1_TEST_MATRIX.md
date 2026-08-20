# QUALITY-01.1 · Matriz de pruebas

**81 comprobaciones propias** — 24 puras/estáticas, 41 contra base real, 16 por
HTTP siguiendo la navegación. Todas en verde, en LOCAL y en STAGING.

Se suman a las 98 de QUALITY-01, que siguen pasando.

---

## 1. Las tres suites

| Suite | Comando | Grupos del encargo |
|---|---|---|
| Puras y estáticas | `npm run test:quality011` | B (navegación), G (selector), fronteras |
| Base real | `npm run test:quality011-rls` | A (cargos), C (invitaciones), D (categorías), E/F (documentos) |
| Recorrido humano | `npm run test:quality011-ui` | El recorrido completo de la Parte 11 |

**Requisitos.** Las dos últimas necesitan Supabase en marcha; la tercera además
`npm run build` previo. Solo la primera entra en `npm run test:all`.

### Una regla que gobierna la tercera suite

**No se escribe ninguna URL interna a mano.** Cada destino sale del `href` que
renderiza la pantalla anterior, con un ayudante que busca el enlace por su
texto visible — como haría una persona.

No es purismo. Los tres defectos más visibles de este sprint eran precisamente
de navegación: una prueba que teclea `/quality` no habría visto que la tarjeta
del selector no era un enlace, ni que «Equipo» expulsaba a PCR, ni que el
enlace de invitación no estaba por ninguna parte.

---

## 2. Suite pura y estática — 24 comprobaciones

`tests/unit/quality-01-1-acceptance.test.ts`

### B · «Sistema» no puede sacar de Quality (8)

| # | Comprobación |
|---|---|
| B1 | Las cuatro rutas transversales **conservan** el módulo de origen, para Quality y para Textiles |
| B2 | La **ruta manda** sobre el parámetro: no secuestra Textiles, ni Quality, ni el dashboard de CPR |
| B3 | Un valor inventado se ignora (`"hacker"`, `"QUALITY"`, `"quality "`, vacío, nulo) y cae a CPR |
| B4 | Se decoran solo los enlaces transversales; los propios del módulo y los de CPR quedan limpios; el separador es correcto si la URL ya trae parámetros |
| B5 | El grupo «Sistema» **no contiene rutas exclusivas de un módulo**: se comprueba en disco que ninguna vive bajo `(cpr)`. Onboarding salió y está en la navegación de CPR |
| B6 | La navegación y el encabezado resuelven el módulo con el parámetro |
| B7 | Los ≥5 enlaces de Quality apuntan dentro de Quality y **cada uno tiene su página en disco** |
| B8 | **Ningún `href`** de los componentes de Quality sale del módulo |

### G · Selector de módulos (4)

| # | Comprobación |
|---|---|
| G1 | Quality FULL + habilitado + switch ON → estado `full`, etiqueta «Plan Full», enlace `/quality` |
| G2 | Kill switch APAGADO → sin enlace |
| G3 | PCR y Textiles conservan su entrada; el destino de CPR resuelto en servidor se respeta |
| G4 | **Todo módulo funcional declara ruta y esa página existe**, resolviendo los grupos de rutas |

### Documentos · fronteras (5)

| # | Comprobación |
|---|---|
| E1 | **0113 no crea ninguna tabla**; no existe `quality_documents`; la restricción admite los tres módulos |
| E2 | La capa de datos es `server-only`, se apoya en el motor, no usa `service_role`, fija el módulo en servidor |
| E3 | Las ≥5 actions pasan por la guarda de Quality; **ninguna depende de PCR ni de Textiles**; el módulo no llega del cliente |
| E4 | El editor se **reutiliza**: importa `SectionEditor` y no reimplementa el campo de edición |
| E5 | La lista separa propios de vinculados, muestra el origen y explica que vincular no duplica |

### Categorías (2)

| # | Comprobación |
|---|---|
| D1 | Las etiquetas del dominio y los nombres que fija 0113 dicen **lo mismo** para los cuatro códigos |
| D2 | El trigger del catálogo sigue bloqueando a los roles cliente; **no se desactiva** para mantener los datos |

### Invitaciones · fronteras (3)

| # | Comprobación |
|---|---|
| C1 | El enlace usa el **origen real**; la variable queda como respaldo, y el orden se comprueba sobre el código, no sobre los comentarios |
| C2 | La lista muestra el enlace con su token, copiable, **solo en pendientes y solo a quien administra** |
| C3 | Aceptar usa `organization_effective_plan_code`; desaparece la lectura del plan heredado y el `update` que el `raise` revertía |

### Migración (2)

| # | Comprobación |
|---|---|
| M1 | Append-only, sin duplicados, sin `GRANT ALL`, sin `ALTER DEFAULT PRIVILEGES`, `anon` sin privilegios |
| M2 | La política de DELETE exige rol; **ninguna FK pasa a `cascade`**; no se toca la que protege la propiedad de los procesos |

---

## 3. Suite contra base real — 41 comprobaciones

`tests/rls/quality-01-1-acceptance.test.ts` · cuatro usuarios, cuatro empresas,
una de ellas **quality-only**. El `service_role` solo crea usuarios.

### D · Categorías (7)

| # | Comprobación |
|---|---|
| D1 | Las **cuatro** por defecto, con nombre, orden y estado |
| D2 | **La consulta literal de la aplicación** funciona; y `display_order` sigue sin existir, por si alguien la reintroduce |
| D3 | Una empresa **nueva** las recibe sin aprovisionar nada |
| D4 | Con categorías disponibles, el proceso **sí** se puede crear |
| D4b | El catálogo base sigue siendo **intocable desde un cliente**: ni renombrar ni borrar |
| D4c | Los nombres son los congelados, en español correcto |
| D5 | Una empresa añade su **propia** categoría; otra empresa no la ve |

### A · Ciclo de vida del cargo (8)

| # | Comprobación |
|---|---|
| A1 | Crear |
| A2 | Editar nombre, código, área y descripción |
| A3 | Un cargo **sin uso se elimina de verdad** |
| A4 | Un cargo **en uso no se puede eliminar**: `23503` desde la base |
| A5 | Desactivarlo **conserva el proceso, su propietario y sus datos** |
| A6 | Una **asignación** también impide el borrado |
| A7 | Cross-tenant: otra empresa no edita ni borra un cargo ajeno |
| A8 | Un `consultant` no puede eliminar cargos |

### C · Invitaciones (10)

| # | Comprobación |
|---|---|
| C1 | El token se persiste y se puede **releer** después — lo que faltaba |
| C2 | Persona **sin cuenta**: se registra y queda como miembro activo |
| C3 | Persona **con cuenta**: acepta con el rol invitado |
| C4 | Token **inválido** rechazado |
| C5 | Token **expirado** rechazado; nadie entra; la caducidad se deriva de la fecha |
| C6 | Token **ya utilizado**: «Esta invitación ya fue aceptada» |
| C7 | Token **revocado** rechazado |
| C8 | **Otro correo** no puede usar el token, y no entra |
| C9 | Cross-tenant: otra empresa no **lee** las invitaciones ajenas (ni sus tokens) ni las revoca |
| C10 | Otra empresa no puede **crear** invitaciones dentro de la primera |

### E/F · Documentos (12)

| # | Comprobación |
|---|---|
| E0 | La empresa queda con **PCR y Textiles deshabilitados**, Quality en Full |
| E1 | Crea un documento **propio** de Quality; `module_key='quality'`; nace en borrador |
| E2 | Le añade secciones y las edita, con el motor |
| E3 | Se consulta filtrando por módulo |
| E4 | El módulo es **inmutable**: no cruza a PCR |
| E5 | Se asocia a un proceso de Quality |
| F0 | Una empresa **sin PCR no puede crear documentos de PCR** (`MODULE_ACCESS_BLOCKED`) |
| F1 | En una empresa con ambos, Quality **vincula** un documento de PCR |
| F2 | Vincular **no duplica** ni cambia el módulo de origen |
| F3 | La lectura distingue propios de vinculados y conserva el origen |
| F4 | Cross-tenant: no se puede vincular ni leer un documento de otra empresa |
| F5 | La empresa quality-only no ve documentos ajenos |

### Invariantes por SQL directo (4)

| # | Comprobación | Resultado |
|---|---|---|
| S1 | La restricción de módulo admite `cpr`, `textiles`, `quality` | ✔ |
| S2 | La política de DELETE de cargos exige `admin`/`quality` | ✔ |
| S3 | Ambas FK que protegen el historial siguen en **RESTRICT** | ✔ |
| S4 | `anon` sin privilegios sobre `quality_*` tras 0113 | ✔ 0 |

---

## 4. Recorrido humano — 16 comprobaciones

`tests/e2e/quality-01-1-human-walkthrough.test.ts`

| # | Paso | Qué comprueba |
|---|---|---|
| 1 | Login | La sesión abre la aplicación |
| 2 | Selector | Quality es un **enlace** con «Entrar →» a `/quality` |
| 3 | Entrar | Siguiendo el `href` de la tarjeta; de ahí salen los cuatro destinos |
| 4 | Cargos | Aparecen **Editar, Asignar persona, Desactivar y Eliminar** |
| 5 | Editar cargo | El cambio se refleja en la pantalla |
| 6 | Categorías | Las cuatro llegan a la pantalla — **el defecto reportado** |
| 7 | Crear proceso | Con categoría y cargo propietario visibles |
| 8 | **Sistema** | «Equipo» enlaza con el módulo; responde 200; el encabezado **sigue diciendo Quality** y **no** aparece «NTC 6632»; hay vuelta al módulo |
| 9 | Mapa | Accesible desde Quality |
| 10 | Documentos | Las dos secciones y «Crear documento» |
| 11 | Crear documento | Aparece en su lista; su detalle es enlazable |
| 12 | Abrir y editar | Secciones, «Guardar contenido» y vuelta a Documentos de Quality |
| 13 | Vincular existente | Se ofrece, aparece con **«Origen: PCR»**, y **no se duplica** |
| 14 | Invitación | La lista muestra el enlace **con el token**, absoluto — **el defecto reportado** |
| 15 | Abrir el enlace | La página **no** dice que falta el token; reconoce la invitación |
| 16 | Aceptar | El invitado queda como miembro activo con su rol |

---

## 5. Resultados

| Suite | LOCAL | STAGING |
|---|---|---|
| `test:quality011` (24) | ✅ 24/24 | n/a (estática) |
| `test:quality011-rls` (41) | ✅ 41/41 | ✅ **41/41** |
| `test:quality011-ui` (16) | ✅ 16/16 | ✅ **16/16** |
| `test:quality01-rls` (56) | ✅ 56/56 | ✅ **56/56** |
| `test:quality01-ui` (15) | ✅ 15/15 | — |
| `test:quality01` (41) | ✅ 41/41 | n/a |

---

## 6. Regresión

`npm run test:all` (**~1.400 comprobaciones, 82 suites**) → **exit 0**.
`typecheck` limpio · `lint` 0 errores (1 aviso preexistente, ajeno) · `build`
compila con las 7 rutas de Quality dinámicas.

`test:rls` **110/110** · `t9f-rls`, `t9f1-rls`, `t9f2-rls`, `t9f4-rls`,
`textiles-rls-multitenant`, `t9e2`, `t9e4` — todas verdes.

### Pruebas actualizadas — ninguna debilitada

| Prueba | Antes | Ahora |
|---|---|---|
| `textiles-trazadocs` 12 | El tipo del motor con dos módulos | Con los tres. Sigue exigiendo default `'cpr'` y filtro por módulo en cada consulta |
| `v1-release` 24c | La variable de sitio en `team.ts` | En el constructor de enlaces, **más** la exigencia de que la action lo use |
| `quality-01-foundation` 26 | «La última migración es 112» | 0112 existe, sin renumeraciones, y la cola no retrocede |
| `quality-01-walkthrough` 3 y 5 | «De gestión del sistema» | «Sistema» — el nombre congelado |
| 16 listas de migraciones | 0111 + 0112 | Declaran también 0113 |

---

## 7. Sobre estas pruebas

Tres decisiones que conviene señalar, porque explican por qué algunas
comprobaciones parecen indirectas:

**Se comprueba el estado, no el error.** Un trigger que revierte un `UPDATE` no
devuelve error: la fila simplemente no cambia. Comprobar solo el código de
error habría dejado pasar un trigger que no revierte nada.

**Se eliminan los comentarios antes de buscar en el código.** Una prohibición
se verifica sobre lo que se ejecuta, no sobre la prosa que la explica. Dos
comprobaciones de este sprint fallaron por eso en su primera versión.

**Se comprueba la ausencia, no solo la presencia.** Que la tarjeta de un módulo
apagado *no* sea un enlace, que una revisión publicada *no* ofrezca guardar,
que un componente de Quality *no* tenga ningún `href` hacia PCR. Una prueba de
presencia habría pasado en los tres casos.
