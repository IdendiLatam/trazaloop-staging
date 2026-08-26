# EXPORT-01.1 · Matriz de pruebas

| Suite | Qué comprueba | Resultado |
|---|---|---|
| `npm run test:export011` | Que no quede ningún pendiente, y que no se pueda fingir que no queda | **31 conformes, 0 fallos** |
| `npm run test:export01` | Que el motor de EXPORT-01 sigue intacto con 85 exportaciones | **54 conformes, 0 fallos** |
| Validación en Staging | PDF reales, aislamiento, entitlement y volumen contra la base real | **43 conformes, 0 fallos** |
| `npm run test:all` | Regresión completa | **exit code 0** |

---

## La suite de EXPORT-01.1, grupo por grupo

### A · El inventario no admite pendientes (8)

La comprobación que define el sprint es `A1`: **ninguna fila en estado
provisional**. Prohíbe literalmente `PENDING`, `TODO`, `LATER`, `MECHANICAL`,
`NOT_IMPLEMENTED` y `UNRESOLVED` en el inventario, y exige que los tres ejes de
cada entidad estén en uno de los cuatro estados finales.

Las otras siete existen para que `A1` no se pueda satisfacer haciendo trampa:

- `A2`–`A4` · toda ficha, listado o histórico declarado `AVAILABLE` **tiene**
  definición en el registro. Prometer no basta.
- `A5` · la dirección contraria: toda exportación del registro **está
  clasificada**. Si alguien añade una clave y no la clasifica, el inventario
  deja de ser el inventario.
- `A6` · un `NOT_APPLICABLE` trae **motivo real**: mínimo 25 caracteres y
  ninguna de las fórmulas vacías («no alcanzó el tiempo», «más adelante»).
- `A7` · un `EMBEDDED` nombra a su **padre**, y el padre existe en el inventario.
- `A8` · un `HISTORICAL_NOT_SUPPORTED` explica **qué no guarda el dominio** y
  la entidad tiene, además, PDF actual. Es la comprobación que impide usar la
  clasificación como excusa para no implementar.

`A6`, `A7` y `A8` fallaron la primera vez que se ejecutaron, contra el
inventario que yo mismo acababa de escribir: dos motivos demasiado cortos para
ser motivos, un padre que no existía como entidad y once límites históricos que
decían «el catálogo guarda lo vigente» sin decir qué **no** guarda. Se
corrigieron los textos, no las pruebas.

### B · Qué afirma cada PDF sobre el tiempo (3)

- `B1` · una exportación marcada `current` **explica** por qué no hay histórico.
- `B2` · una marcada `historical` **no** lleva el aviso de estado actual: no se
  pueden decir las dos cosas.
- `B3` · el aviso existe, usa el texto acordado y **no es alarmista**.

### C · Lo que EXPORT-01 dejó abierto (7)

- `C1` · la acción tiene ficha propia y hay **una sola** definición para todos
  sus orígenes. Dos exportadores habrían convertido una diferencia de contexto
  en una diferencia de motor.
- `C2` · la ficha muestra la fecha objetivo **original** junto a la vigente.
- `C3` · el PDF del control **dice en qué se diferencia** de una acción.
- `C4` · la ficha de empresa no contiene `billing`, `stripe`, `password`,
  `token`, `secret` ni `hash`.
- `C5` · el listado de equipo **no imprime el token** de invitación.
- `C6` · TrazaDocs usa el mismo motor en los tres módulos, y **no existe** un
  `pcrDocumentPdf()` ni un `textileDocumentPdf()`.
- `C7` · los maestros filtran con los nombres de la pantalla y con **la misma
  función** del dominio — en los dos sentidos: si la pantalla deja de usarla,
  falla igual.

### D · Ningún atajo nuevo en seguridad (4)

- `D1` · no hay ninguna ruta de descarga fuera del endpoint único (salvo los dos
  artefactos documentales heredados, enumerados por nombre).
- `D2` · ningún adaptador usa `service_role`.
- `D3` · ningún adaptador acepta la empresa desde la petición.
- `D4` · el endpoint sigue exigiendo sesión, empresa activa y entitlement, y
  `core` declara **explícitamente** que no exige entitlement de módulo.

### E · Recuento (3)

`E2` es el que imprime la cifra que da nombre al sprint.

### F · Los documentos siguen al dato (4)

La matriz publicada se **genera** desde el inventario tipado. `F1`–`F4`
comprueban que lo publicado nombra todas las entidades, todas las claves, los
recuentos exactos y que el inventario de EXPORT-01 quedó sincronizado. Un
documento de cobertura desactualizado es peor que no tenerlo: se consulta
creyendo que dice la verdad.

### G · Un embebido mal nombrado devuelve vacío, no un error (2)

Ver abajo. Es el hallazgo más importante del sprint.

---

## El defecto que encontró la validación en Staging

**Síntoma:** el PDF de una acción respondía 404, y el listado de acciones salía
con la tabla vacía pero con estado 200.

**Causa:** `work_actions.owner_position_id` forma parte de una clave foránea
**compuesta** (`(organization_id, owner_position_id)`, MDR-42). PostgREST no
sabe resolverla por el nombre de la columna: responde *«Could not find a
relationship»*. Y ese error viaja en `error`, no en `data`, así que
`(data ?? [])` lo convierte en **una lista vacía**.

**Alcance:** el defecto **no era de este sprint**. `listCaseActions` —de
QUALITY-04— ya usaba esa forma, y `listCaseRequirements` la usaba también para
`trazadoc_documents:document_id`, que es otra clave compuesta. Mis funciones
nuevas lo heredaron al copiar el patrón.

Lo que eso significaba en producción: **la tabla de acciones de un caso y sus
requisitos documentales aparecían vacíos**, en pantalla y en el PDF, como si el
caso no tuviera ninguna.

**Por qué no lo cazó nadie antes:** porque un fallo que se manifiesta como «no
hay datos» no se reporta. Una prueba que solo comprueba que la respuesta es 200
lo da por bueno; una pantalla con una tabla vacía parece un caso sin acciones.

**Corrección:** los cuatro embebidos se nombran ahora por la **restricción**
(`quality_positions!work_actions_owner_position_fk`), que sí es unívoca.

**Prevención:** `G1` fija la forma correcta en los cuatro sitios. `G2` recorre
todo `lib/db/` y **prohíbe cualquier embebido por columna** que no esté en una
lista blanca de dos entradas, ambas verificadas como claves simples. Añadir uno
nuevo obliga a comprobar si la clave es compuesta, en vez de descubrirlo cuando
una pantalla aparezca vacía.

---

## Validación en Staging · 43 comprobaciones

Dos empresas efímeras: **A** con los tres módulos, **B** solo con Quality.

| Bloque | Qué se comprobó | Nº |
|---|---|---|
| Familias nuevas | 26 listados nuevos devuelven `%PDF-`, `application/pdf`, `no-store`, y llevan el nombre de la empresa de la sesión | 26 |
| Ficha de empresa | Imprime la empresa, lleva el aviso de estado actual y **no** contiene stripe, secret, token ni billing | 1 |
| Acción | Imprime título, **las dos fechas objetivo**, la palabra «prorrogada» y **el caso del que viene** | 1 |
| Control | Imprime el control y **explica que es una barrera permanente** | 1 |
| Revisión de proceso | Imprime UNA revisión | 1 |
| Diagnóstico sin datos | **404**, no 500 | 1 |
| Aislamiento | La ficha de A con `organization_id=B` trae los datos de **A**; B no puede la acción ni el control de A | 3 |
| Entitlement | B (solo Quality) recibe **403** en cinco exportaciones de PCR y Textiles, y **200** en la suya | 6 |
| Volumen | 250 materiales con «Ñ» → **9 páginas, sin truncar**, primera y última fila presentes | 1 |
| Limpieza | Las dos empresas efímeras se retiran | 1 |
| Cuentas QA | Las tres permanentes siguen existiendo | 1 |

### Rendimiento

**250 filas → 9 páginas · 116 KiB · 1.329 ms** de extremo a extremo contra
Staging: consulta remota, adaptador y renderizado. El renderizador aislado hace
1.000 filas en 15 ms, así que ese tiempo es **el viaje a la base**, no el
dibujo.

### Tres hallazgos de sembrado, y por qué se cuentan

La primera ejecución falló tres veces seguidas al **sembrar** y al **limpiar**,
y las tres veces la base tenía razón:

1. Un **control vigente no se borra** (RO-23): hay que devolverlo a borrador.
2. Un **caso con historia no se borra** (AC-13): igual.
3. Una **referencia** solo admite `origin`, `evidence` o `related`.

Se corrigió el guion de validación, no las reglas. Cuando la base se resiste a
un borrado, la primera hipótesis debe ser que la base tiene razón.
