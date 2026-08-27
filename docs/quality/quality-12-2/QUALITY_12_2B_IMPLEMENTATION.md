# QUALITY-12.2B · Perfil de empresa y contexto de autoría de Quality

**Base** `cd23fb6` (QUALITY-12.2A)
**Migración** `0137_organization_profile_and_quality_guidance.sql`
**Local 0137 · Staging 0137 · Production 0111 — sin tocar**
**Sin llamadas a ningún proveedor de IA.**

---

## Qué construye este sprint

De las cuatro clases de contexto que Trazaloop Intelligence tendrá que
distinguir, 12.2B construye una y completa otra:

```
USER_TEXT                 ← lo que la persona escribe · ya existe
AUTHORING_GUIDANCE        ← 12.2A · aquí se completa para Quality
ORGANIZATION_CONTEXT      ← AQUÍ · el perfil de la empresa
RELATED_SYSTEM_CONTEXT    ← 12.2D
```

Y mantiene la frontera que las separa: **el perfil dice a qué se dedica la
empresa; la guía dice qué debería contener una sección; ninguno de los dos dice
qué hace la empresa en sus procesos.**

---

## A · El perfil

Cuatro columnas en `organizations` —no una tabla 1:1—, un catálogo de veinte
sectores y una función que devuelve el perfil compacto.

Detalle completo en `QUALITY_12_2B_ORGANIZATION_PROFILE.md`.

## B · Campos y obligatoriedad

| Campo | Obligatorio | Dónde se captura |
|---|---|---|
| `sector_code` | no | alta + datos de empresa |
| `primary_activity` | no | alta + datos de empresa |
| `products_services` | no | datos de empresa |
| `organization_description` | no | datos de empresa |

**Ninguno es obligatorio en la base**, y se revisó antes de congelarlo: una
columna `not null` habría roto las empresas existentes —obligando a inventarles
un valor, que §8 prohíbe— y habría roto también
`create_platform_organization` y las suites, que crean empresas por otra vía.
La obligatoriedad, si algún día la hay, es del formulario.

## C · Límites

| Campo | Límite |
|---|---|
| `primary_activity` | 3–160 caracteres |
| `organization_description` | 10–280 caracteres |
| `products_services` | 1–6 elementos, 2–50 caracteres cada uno |

En la **base**, no solo en el formulario. Y elegidos para que el perfil máximo
quepa en el presupuesto: con 320 en la descripción se iba a 267 tokens con tope
260, así que se bajó a 280 y quedó en 256.

## D · Contexto compacto

`organization_authoring_context(org)` → nombre, sector, actividad, productos y
descripción. **Nada más.** Ni identificadores, ni fechas, ni facturación, ni
logo, ni NIT, ni dirección. Una prueba lo comprueba campo a campo sobre la
propia función SQL.

## E · Presupuesto medido

| | Tokens |
|---|---|
| Perfil típico | **106** |
| Perfil real medido contra Staging | **90** |
| **Máximo posible** | **256** |
| Tope | **260** |

No se trunca en silencio: lo que no cabe se rechaza al validar, con un mensaje
que explica por qué.

## F · Alta de empresa

Dos campos más, ninguno un párrafo: sector de una lista y actividad principal
en una línea. Productos y descripción, después.

Si el perfil falla al escribirse, **el alta no se cae**. Y
`create_organization` no se toca: su firma es la de 0042 y tiene sus propias
reglas de negocio; el perfil se escribe aparte, con la sesión de quien acaba de
quedar como administrador.

## G · Empresas existentes

Siguen funcionando, con los cuatro campos en null. **No se les inventó nada.**
Su contexto compacto devuelve solo el nombre, que es cierto y utilizable. Una
prueba comprueba que la migración no contiene un solo `update ... set
sector_code`.

## H · Edición posterior

En **Datos de empresa**, sección propia: «A qué se dedica la empresa». Contador
de caracteres a la vista y un aviso que explica para qué sirve y que nada de
eso se convierte en un registro del sistema de gestión.

Mismo guarda que el resto: lo consulta cualquier miembro, lo edita quien
administra, y con la comprobación de estado de la suscripción que ya existía.

**El perfil no se versiona**, y es una decisión documentada: describe lo que la
empresa **es hoy**, no un hecho fechado. Que cambiara de sector hace dos años
no cambia nada de lo que se redactó entonces — la guía sí se versiona, porque
de ella dependía cómo se escribió.

## I · Los papeles de sección de Quality

Inventariados leyendo `DEFAULT_SECTIONS` en el código de producto, no
suponiendo: `purpose`, `scope`, `responsibilities`, `development`, `records`.

## J · Cobertura

**5 de 5 · 100 %.** Las secciones que una empresa añade a mano no reciben guía,
y es correcto: no son papeles, su clave se genera del título libre, y no hay
guía genérica que ayude a redactar una sección cuyo tema solo conoce quien la
creó.

**No se crearon estructuras falsas para Quality.** Se usó el alcance
`section_role` que 12.2A dejó preparado.

Detalle en `QUALITY_12_2B_QUALITY_GUIDANCE.md`.

## K · Enriquecimiento

**68 guías** de CPR y Textiles recibieron `do_not_invent` y
`related_context_types`, derivados del **papel** de la sección —`responsables`
invita a poner un cargo que nadie definió; `registros`, a listar formatos que
no existen—. Eso se deriva de la clave, no de una opinión sobre el texto.

`purpose` y `example` **siguen vacíos en las 250**, y es deliberado: derivarlos
habría sido redacción nueva presentada como derivación. Se rellenan en las
cinco guías de Quality, que se escribieron desde cero y donde sí hay autor.

Cada enriquecimiento es una **revisión nueva**, con la anterior cerrada.

`related_context_types` pasa a estar validado contra una taxonomía cerrada de
doce valores, sin sinónimos: en 12.2D no habrá que adivinar cuál significa qué.

## L · Revisión normativa

Las cinco guías de Quality quedan `safe`: **ninguna cita una norma**. Orientar
la redacción de un «Objetivo» no lo necesita, y hacerlo habría convertido una
ayuda editorial en una insinuación de conformidad.

Las de CPR y Textiles conservan su clasificación de 12.2A: 231 `safe`, 18
`normative_reference`, 1 `ambiguous`, **0 en riesgo**.

## M · Paridad de CPR y Textiles

Intacta. Las 250 guías de estructura siguen en pie, ninguna perdió su texto, y
el botón «i» de los dos módulos sigue resolviéndose igual. `t9g-parity`,
`hint-demo-access`, `trazadocs` y `textiles-trazadocs` en verde.

## N · Demo, Full y Extra

La misma regla de 12.2A, sin excepciones para Quality: en Demo llega
`has_guidance` y `restricted` y **nada más**. Sin cuarto estado.

## O · Seguridad

Contexto compacto: exige pertenencia, `security definer` con `search_path`
fijo, sin `service_role`. Edición: rol, empresa activa y el identificador
siempre del servidor. Catálogo: solo lectura, `revoke all` antes de conceder,
nada para `anon`.

Probado por ataque: cruce entre empresas, identificador directo, módulo
equivocado, papel inexistente, peticiones malformadas con SQL dentro, no
miembro y rol sin permiso.

## P · Archivos

```
supabase/migrations/0137_organization_profile_and_quality_guidance.sql   nuevo
lib/domain/organization-profile.ts                                      nuevo
lib/db/organization-profile.ts                                          nuevo
components/domain/settings/organization-profile-form.tsx                nuevo
lib/db/authoring-guidance.ts               + resolveSectionRoleHintMap
server/actions/settings.ts                 + perfil de empresa
server/actions/organizations.ts            el alta captura sector y actividad
components/layout/create-org-form.tsx      dos campos más
app/(app)/select-org/page.tsx              pasa el catálogo de sectores
app/(app)/(shell)/settings/company/page.tsx        sección de perfil
app/(app)/(shell)/quality/documents/[documentId]/page.tsx  guía por papel
components/domain/quality/document-control-detail.tsx      botón «i» de Quality
tests/unit/quality-12-2b-profile-and-guidance.test.ts      nuevo · 28
tests/rls/quality-12-2b-profile.test.ts                    nuevo · 29
```

## Q · Migración

`0137`, append-only. No toca la 0136 ni ninguna anterior.

## R · Pruebas

| Suite | Resultado |
|---|---|
| `test:quality122b` | **28 ✔ · 0 ✘** |
| `test:quality122b-rls` | **29 ✔ · 0 ✘** |
| `test:quality122a` · `-rls` | 30 ✔ · 24 ✔ |
| QUALITY-12 · 12.1 · TrazaDocs · Textiles · T9G | verde |
| `npm run test:all` | **EXIT 0** |

Detalle en `QUALITY_12_2B_TEST_MATRIX.md`.

## S · Réplica limpia

0001…0137 desde cero, con las suites de base real repetidas: 250 guías de
estructura, 5 por papel, 20 sectores.

## T · Cabeceras

| Entorno | Cabecera |
|---|---|
| Local | **0137** |
| Staging | **0137** · 0 desalineadas |
| **Production** | **0111 · sin tocar** |

Repo **remote-unlinked**.

## U · Preview

**No se creó.** El razonamiento está en la matriz de pruebas: lo que cambia en
pantalla son dos campos opcionales, una sección nueva de formulario y un botón
«i» que ya lleva meses funcionando en los otros dos módulos con el mismo
componente. Cuando 12.2C ponga delante del usuario un botón que llama a un
modelo, ahí sí hará falta.

## W · Gaps

Ninguno del alcance de 12.2B.

Queda **deliberadamente pendiente**, y documentado como decisión y no como
olvido: `purpose` y `example` siguen vacíos en las 250 guías de CPR y Textiles.
Rellenarlos exige que alguien los escriba, y escribirlos automáticamente sería
inventar.
