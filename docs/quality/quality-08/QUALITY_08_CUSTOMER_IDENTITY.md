# QUALITY-08 · Identidad del cliente

> **VC-03 · §5, §6, §7**

## 1 · El cliente es un PAPEL, no una ficha

QUALITY-07 creó `quality_external_parties` como identidad empresarial
transversal, y su catálogo de papeles **ya admitía `'customer'`**. Este sprint
no creó ninguna tabla de clientes: creó el PERFIL del cliente, hermano exacto
del perfil de proveedor.

```
quality_external_parties           ACME S.A. · NIT 900…
├── roles: supplier, customer      ← los dos papeles, una identidad
├── quality_supplier_profiles      ← la relación de compra (Q07)
└── quality_customer_profiles      ← la relación de venta (Q08)
```

La consecuencia práctica es la que pide §5: **ABC puede ser simultáneamente
cliente y proveedor** con una identidad y dos relaciones distintas. Sus sedes y
sus contactos se comparten, porque son de la empresa y no del papel. La ficha lo
dice: `is_also_supplier`.

Un único `(organization_id, party_id)` impide dos relaciones de cliente con la
misma empresa. La suite lo prueba intentándolo.

## 2 · Reutilizar antes que crear

En `/quality/customer-voice/customers`, la tarjeta **«Empresas que ya están
registradas»** aparece antes que la de crear un cliente nuevo. No es orden
decorativo: si crear estuviera primero, ACME acabaría dos veces y nadie sabría
cuál mirar. Una prueba estática compara las posiciones en el archivo.

`listPartiesWithoutCustomerRole()` es la lista que lo hace posible: empresas
externas activas que todavía no tienen perfil de cliente, marcando cuáles ya son
proveedores.

## 3 · §6 · Cliente ≠ contacto

| | Qué es | Dónde vive |
|---|---|---|
| Cliente | la entidad empresarial | `quality_customer_profiles` → `quality_external_parties` |
| Contacto | la persona con quien se habla | `quality_external_party_contacts` |

Un cliente puede tener varios contactos, y puede no tener ninguno: no hay
`contact_id not null` en ninguna parte.

Y la voz **no se guarda contra un nombre de texto**. `quality_customer_feedback`
apunta a `customer_id`; `reporter_name` existe solo para quien todavía no tiene
ficha, y no es la identidad histórica. Cuando el contacto cambia, no se pierde
nada de lo que la empresa ya dijo.

## 4 · §7 · Contacto ≠ quien responde

Quien responde una encuesta puede ser cuatro cosas distintas, y responder **no
crea un contacto**:

| `respondent_kind` | Cuándo |
|---|---|
| `contact` | es un contacto registrado del cliente |
| `customer` | se sabe la empresa pero no la persona |
| `named` | dio su nombre y no tiene ficha |
| `user` | es un usuario de Trazaloop |
| `anonymous` | la campaña prometió anonimato |

Obligar a crear un contacto por cada respuesta es la forma más segura de no
recibir respuestas — y en una campaña anónima sería, además, exactamente lo que
no puede pasar.

## 5 · El puente con PCR

`customer_requirements` de PCR identifica al cliente con `customer_name TEXT`.
Es el anti-patrón que §6 describe, y ya está en producción con evidencias y
ejercicios de trazabilidad colgando de él.

No se migró. Se abrió el puente:

```sql
alter table public.customer_requirements add column external_party_id uuid;
```

Nueva, **opcional**, con FK compuesta. PCR no depende de Quality y sigue
funcionando con el módulo apagado. Quien quiera enlazar sus acuerdos con la
identidad transversal, puede; quien no, no nota nada.

**Queda declarado como deuda**: mientras nadie lo enlace, PCR seguirá teniendo
el nombre del cliente en texto libre. Resolverlo del todo exige migrar datos de
PCR y está fuera del alcance de este sprint.

## 6 · §50 · Mismo NIT, empresas distintas

Heredado de QUALITY-07 y sin cambios: `quality_external_parties` lleva
`organization_id not null` y no tiene índice único global sobre `tax_id`. El
cliente «ACME, NIT 900…» de la empresa A y el de la empresa B son registros
independientes que no se ven entre sí.
