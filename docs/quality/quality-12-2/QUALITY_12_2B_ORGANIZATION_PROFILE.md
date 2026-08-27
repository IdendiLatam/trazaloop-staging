# QUALITY-12.2B · El perfil de la empresa

## Qué es, y qué no es

**Es contexto de estilo.** A qué se dedica la empresa, para poder redactar en su
vocabulario: escribir «envases» donde una guía genérica diría «productos», y no
proponerle a una empresa de software un ejemplo de planta de alimentos.

**No es evidencia.** Que el perfil diga «fabricante de envases plásticos» no
autoriza a afirmar nada sobre sus procesos, sus controles, sus responsables ni
sus frecuencias. Es la misma frontera que separa `AUTHORING_GUIDANCE` de
`ORGANIZATION_CONTEXT`, y se sostiene igual: por lo que el modelo de datos
contiene, no por una advertencia.

---

## Dónde vive, y por qué ahí

**Cuatro columnas en `organizations`**, no una tabla aparte.

La relación sería 1:1 y siempre existiría, así que una tabla anexa habría
añadido una unión, una RLS nueva y un caso «no tiene fila» que no significa
nada distinto de «tiene fila vacía». `organizations` ya tiene exactamente la
política que hace falta: la lee cualquier miembro, la edita quien administra.

```
sector_code               → organization_sectors(code)
primary_activity          text
products_services         text[]
organization_description  text
```

---

## Los campos, y qué se exige de cada uno

| Campo | Obligatorio | Tope | Por qué ese tope |
|---|---|---|---|
| `sector_code` | **no** | catálogo cerrado | agrupar y hablar con vocabulario estable |
| `primary_activity` | **no** | 3–160 caracteres | es una línea, no un párrafo |
| `products_services` | **no** | 1–6 elementos, 2–50 caracteres cada uno | los principales, no un catálogo |
| `organization_description` | **no** | 10–280 caracteres | un párrafo breve |

**Ninguno es obligatorio, y es deliberado.** El encargo proponía exigir sector
y actividad en el alta; se revisó la compatibilidad antes de congelarlo y se
descartó por dos razones concretas:

1. **Las empresas existentes se romperían.** Una columna `not null` sobre una
   tabla con filas obliga a inventarles un valor, y §8 prohíbe exactamente eso.
2. **`create_organization` no es la única puerta.** También existe
   `create_platform_organization`, y las suites crean empresas por RPC. Un
   campo obligatorio en la base habría roto todas esas vías por una regla que
   en realidad es de formulario.

Así que **la obligatoriedad vive donde corresponde**: el alta los pregunta y
son opcionales; la base acepta el perfil vacío como estado legítimo.

### Los topes están en la BASE

No solo en el formulario. Este perfil está pensado para viajar junto al párrafo
que alguien está escribiendo, y un campo sin tope convierte «contexto compacto»
en una promesa incumplible.

Los números no son redondos por casualidad: son los que hacen que el perfil
**más largo posible** —los cinco campos a tope a la vez— siga cabiendo en el
presupuesto. La primera versión ponía 320 en la descripción y el máximo se iba
a **267 tokens** con un tope de 260: cabía «casi», que en un presupuesto es lo
mismo que no caber. Se bajó a 280 y el máximo quedó en **256**.

---

## El catálogo de sectores

Veinte sectores, globales y de solo lectura para las empresas. Texto libre
habría sido más rápido y peor: «Manufactura», «manufactura», «Industria
manufacturera» y «Fabricación» son cuatro filas distintas para lo mismo.

**No es una clasificación económica oficial y no pretende serlo.** Es contexto
de autoría: lo justo para que una guía sepa si ayuda a redactar en una planta
de alimentos o en una empresa de software.

Incluye **«Otro»**, con la indicación de describirlo en la actividad principal.

Mismo patrón que `quality_process_categories`: código estable, nombre,
descripción, orden y activación.

---

## El contexto compacto

`organization_authoring_context(organization_id)` devuelve **solo lo que sirve
para redactar**:

```json
{
  "organization_name": "Envases del Caribe S.A.S.",
  "sector": "Plásticos y caucho",
  "primary_activity": "Fabricación de envases plásticos a partir de resina reciclada",
  "products_services": ["Envases para alimentos", "Preformas PET"],
  "description": "Planta que transforma resina reciclada posconsumo en envases…"
}
```

Ni identificadores internos, ni fechas técnicas, ni facturación, ni
almacenamiento, ni miembros, ni planes, ni logo, ni NIT, ni dirección, ni
teléfono. Una prueba lo vigila campo a campo.

**Un perfil a medio llenar devuelve lo que tenga.** `jsonb_strip_nulls` quita
lo ausente, así que una empresa recién creada devuelve solo su nombre — que es
cierto, es poco y es perfectamente utilizable.

### El presupuesto, medido

| | Tokens |
|---|---|
| Perfil típico bien diligenciado | **≈ 106** |
| Perfil real medido contra la base | **≈ 90** |
| Perfil **máximo posible** | **256** |
| Tope declarado | **260** |

La estimación usa 3,6 caracteres por token, que es lo razonable en castellano.
No es exacta y no pretende serlo: sirve para que una prueba vigile el
presupuesto en vez de confiar en que sí.

**No se trunca en silencio.** Ni el renderizado ni la construcción del payload
recortan: lo que no cabe se rechaza al validar, con un mensaje que dice por
qué. Una prueba comprueba que esas dos funciones no contienen un solo `slice`.

---

## Cómo se captura

### Al crear la empresa

Dos campos más, y ninguno es un párrafo: **sector** de una lista y **actividad
principal** en una línea. Productos y descripción se completan después.

El día que alguien crea su empresa quiere entrar, no redactar.

Si el perfil falla al escribirse, **el alta no se cae**: quedar sin sector es un
perfil incompleto, no una empresa rota. Y la RPC `create_organization` no se
toca —su firma es la de 0042 y tiene sus propias reglas de negocio—: el perfil
se escribe después, con la sesión de quien acaba de quedar como administrador.

### Después

En **Datos de empresa**, una sección propia: «A qué se dedica la empresa». Los
cuatro campos, con contador de caracteres a la vista y un aviso que explica
para qué sirve —nadie rellena un campo cuyo propósito no entiende— y que
recuerda que nada de eso se convierte en un registro del sistema de gestión.

La empresa **no queda atrapada** con lo que escribió al registrarse.

---

## Verdad histórica del perfil: decisión y motivo

**No se versiona.** Es una decisión, no un olvido.

El perfil describe **lo que la empresa es hoy**, no un hecho fechado del
sistema de gestión. Una revisión documental necesita historia porque hay que
poder decir qué decía un procedimiento el día que alguien lo aplicó. Que una
empresa cambiara de sector hace dos años no cambia nada de lo que se redactó
entonces: la guía sí se versiona —y se versiona en 12.2A—, porque de ella
dependía cómo se escribió.

Lo que sí conserva es la trazabilidad que ya existía: `organizations` tiene
`updated_at` y su edición pasa por el mismo camino auditado que el resto de los
datos de empresa.

Si algún día el perfil pasara a sustentar una afirmación —y hoy no lo hace—,
esa decisión habría que revisarla.

---

## Lo que Trazaloop NO hace con el perfil

No lo infiere. Ni el sector, ni la actividad, ni los productos, ni los
mercados, ni las certificaciones, ni los procesos. No se deduce de los
documentos, ni de los módulos contratados, ni del nombre de la empresa.

Si algún día Trazaloop Intelligence propone enriquecerlo, seguirá siendo una
**propuesta** que una persona confirma. QUALITY-12.2B no implementa esa IA y no
llama a ningún proveedor.
