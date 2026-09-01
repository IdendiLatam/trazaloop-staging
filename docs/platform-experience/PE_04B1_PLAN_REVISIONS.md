# PE-04B1 · Las revisiones y el precio

---

## 1 · Por qué una revisión y no una fila que se edita

Hoy `plan_definitions` se edita **en sitio**. Si mañana Full pasa de USD 40 a
USD 45, la fila cambia y el pasado desaparece: no hay forma de responder «¿bajo
qué condiciones contrató esta empresa en marzo?».

Trazaloop ya resolvió esto tres veces —documentos legales (0136), FAQ (0155),
tutoriales (0159)— siempre con la misma forma: **identidad estable, revisiones
inmutables, rangos de vigencia**. No había que inventar nada.

```
plans                identidad · nunca cambia
  └─ plan_revisions  inmutables una vez publicadas
        └─ plan_revision_limits
```

---

## 2 · Qué es inmutable, exactamente

Una revisión **publicada** no admite cambios en:

`plan_code` · `revision_number` · `display_name` · `description` ·
`public_conditions` · `price_state` · `currency` · `monthly_price_minor` ·
`annual_price_minor` · `effective_from` · `published_at` · `published_by`

Lo único que puede moverse es su **cierre**: `effective_to` y el paso a
`retired`. Y una retirada no vuelve a vigencia.

Tampoco se puede **borrar**, ni cambiar sus **límites**. Esa última merece
explicación: si los límites de una publicada se pudieran tocar, la inmutabilidad
de la revisión no serviría de nada — el precio seguiría igual y la promesa sería
otra.

### Lo dice un DISPARADOR, no una política

Es la lección que este repositorio ya pagó con los tutoriales: **una política no
detiene a `service_role`**. Un disparador sí. Los tres —edición, borrado y
límites— son disparadores.

**Un borrador se edita libremente.** Para eso es un borrador.

---

## 3 · Una sola vigente por plan

```sql
create unique index plan_revisions_current_uniq
  on plan_revisions (plan_code)
  where status = 'published' and effective_to is null;
```

Lo impide **el índice**, no un comentario ni la disciplina de quien escribe. Una
prueba intenta publicar una segunda vigente de Full y la base la rechaza.

---

## 4 · Publicar es una primitiva

```sql
plan_publish_revision(p_revision_id, p_effective_from default null)
```

Cierra la vigente, abre la nueva y deja constancia, **en una transacción**. A
mano habría que acertar las tres, hoy y cada vez — que es exactamente lo que
`legal_publish_document` enseñó a no hacer a mano.

Exige `is_platform_superadmin()` dentro de la propia función, no solo en una
política. Y comprueba una cosa más: **una revisión sin almacenamiento declarado
no se publica**. Un plan que no dice cuánto espacio incluye es una promesa
vacía.

### Vigencia desde la publicación

`effective_from` admite una fecha, pero por defecto es `now()`. No hay
publicación programada: obligaría a un planificador o a que toda lectura filtre
por fecha, y no hay caso comercial que lo pida hoy. Si aparece, la columna ya
está.

---

## 5 · El dinero

| Decisión | Por qué |
|---|---|
| **Unidades menores** (céntimos) | 40.00 en coma flotante no es 40.00 |
| **`bigint`**, nunca `numeric` ni `real` | El dinero es entero o es un error de redondeo esperando |
| **Antes de impuestos** | El impuesto depende de dónde esté el cliente, y lo calcula PE-05 |
| **Moneda explícita** | No hay moneda por defecto |

Sembrado:

| Plan | Mensual | Anual | Estado |
|---|---|---|---|
| `free` | **0** | **0** | `configured` |
| `full` | **4000** | **40000** | `configured` |
| `extra` | — | — | **`not_configured`** |

Full: USD 40 al mes y USD 400 al año, antes de impuestos. El anual equivale a
**diez meses**, es decir dos gratis — y hay una prueba que comprueba
`anual = 10 × mensual`, para que si alguien cambia uno sin el otro se note.

### «Sin precio» no es «gratis»

Extra existe y su precio no está decidido. Dejar las columnas en nulo sin decir
nada invitaría a que alguien lo pintara como 0.

```sql
price_state check (price_state in ('configured', 'not_configured'))
```

Free está **`configured` con 0**, porque gratis **sí** es una decisión tomada.
Extra está `not_configured`, porque no lo es. Son cosas distintas y ahora se
distinguen.

Y la base no admite media promesa: configurado exige moneda e importe; sin
configurar no admite ninguno de los dos. Dos pruebas lo intentan por los dos
lados.

### Nada de PE-05

No hay cálculo de impuestos, ni pasarela, ni cupón, ni factura. Una prueba busca
`vat`, `iva`, `tax`, `stripe`, `invoice`, `coupon` y `discount` en la migración
y en el resolutor: cero.

`checkout` **sí** aparece, y a propósito: es uno de los orígenes admitidos de una
asignación, reservado para que PE-05 pueda crear transiciones autorizadas sin
cambiar el esquema. Reservar el hueco no es implementarlo, y la prueba distingue
las dos cosas.

---

## 6 · Público e interno

`v_public_plan_catalog` y `v_public_plan_limits` son lo único que PE-05 podrá
enseñar. Fuera quedan las notas internas, los borradores, las revisiones
retiradas y quién publicó qué.

La decisión de qué es público vive **en la base**, no en un componente: «no lo
pintamos» es una decisión de pantalla, y PostgREST expone la tabla igualmente.

Las vistas **no se conceden a `anon`** todavía. Exponer precios públicamente es
una decisión de PE-05, con su página y su momento; B1 deja la proyección lista y
la puerta cerrada.

`plan_resources.is_public` permite además que un recurso exista sin ser
mostrable — hoy todos lo son, pero el hueco está para los techos de coste.

---

## 7 · Cómo se cambia un precio mañana

1. Crear una revisión **borrador** con el precio nuevo.
2. Copiarle los límites (o poner los que toquen).
3. Revisarla — es un borrador, no la ve ningún cliente.
4. `plan_publish_revision()`.

La anterior queda **retirada** con su `effective_to`, su precio intacto y su
periodo cerrado. Las empresas asignadas a ella **siguen apuntando a ella** hasta
que alguien las mueva, y por eso se puede responder qué se les prometió.
