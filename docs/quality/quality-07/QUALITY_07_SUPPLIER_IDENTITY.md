# QUALITY-07 · Identidad del proveedor · CERO GESTIÓN DUPLICADA

> **GP-02 · GP-33 · MDR-11 · §5, §39, §40, §58, §59**

## 1 · El problema que se estaba a punto de crear

Trazaloop ya tenía proveedores en dos sitios: `suppliers` (PCR) y
`textile_suppliers` (Textiles). Crear un tercero para Quality habría dado el
resultado predecible: la misma empresa tres veces, con tres direcciones que se
desincronizan, tres NIT que un día no coinciden y una persona manteniendo a mano
lo que el sistema debería saber.

Y el argumento a favor de hacerlo —«son módulos distintos»— es falso en lo que
importa: **ACME es una sola empresa**. Lo que cambia entre módulos es el PAPEL
que juega, no su identidad.

## 2 · Lo que se hizo

Una identidad **transversal**, `quality_external_parties`, con sus papeles
declarados aparte:

```
quality_external_parties          ACME S.A. · NIT 900… · Medellín
└── quality_external_party_roles  supplier · customer · laboratory · …
```

Y un **puente** desde los dos módulos que ya existían:

```sql
alter table public.suppliers          add column external_party_id uuid;
alter table public.textile_suppliers  add column external_party_id uuid;
```

Tres decisiones deliberadas sobre ese puente:

1. **Es una columna, no una tabla de enlace.** Una tabla de enlace admitiría
   que un proveedor de PCR apunte a dos identidades, que es exactamente el
   problema que se quiere evitar.
2. **Es NULLABLE.** PCR y Textiles siguen funcionando con Quality apagado, y
   ninguna fila existente se tocó. Una columna obligatoria habría convertido
   este sprint en una migración de datos de dos módulos ajenos.
3. **Lleva índice único parcial.** Dos proveedores de PCR no pueden apuntar a la
   misma identidad: si ACME está dos veces en PCR, eso es un duplicado *de PCR*
   y se resuelve allí, no fingiendo aquí que son la misma fila.

## 3 · Incorporar, no crear

`quality_adopt_supplier(p_source_module, p_source_id, p_owner_position_id)`:

1. lee la fila de PCR o de Textiles y saca de ella la **empresa** —no del
   cliente, que podría mentir—;
2. comprueba el permiso sobre esa empresa;
3. si la fila ya tenía `external_party_id`, **no hace nada nuevo**: devuelve lo
   que hay. Llamarla dos veces es inocuo, porque dos personas pulsarán el botón;
4. si no lo tenía, busca una identidad existente **por NIT y luego por razón
   social** antes de crear una. Es lo que hace que adoptar el mismo ACME desde
   PCR y desde Textiles produzca **una** identidad y **un** proveedor de
   Quality;
5. crea el papel `supplier` y el perfil de Quality si faltan.

La pantalla lo refleja: en `/quality/suppliers` la tarjeta de **incorporar** va
antes que la de **crear**. No es orden decorativo — si crear estuviera primero,
la empresa acabaría con ACME tres veces y administrarlo costaría el triple. La
prueba A3 de `test:quality07` compara las posiciones en el archivo.

## 4 · Duplicados: se sugieren, no se fusionan

`suggestDuplicateParties` señala identidades con el **mismo NIT** o el **mismo
nombre**. Y ahí se detiene.

No hay fusión automática, ni la habrá por este camino. Unir dos identidades
tiene consecuencias en tres módulos —lotes recibidos en PCR, órdenes en
Textiles, evaluaciones y decisiones en Quality— y adivinar cuál sobrevive es
peor que dejar el duplicado a la vista. La prueba A4 comprueba que no existe
ninguna función de fusión.

## 5 · §50 · Mismo NIT, empresas distintas

`quality_external_parties` lleva `organization_id not null` y **no** tiene
índice único global sobre `tax_id`. Es intencional: el proveedor «ACME, NIT
900…» de la empresa A y el de la empresa B son registros distintos que no se
ven entre sí. Un único global habría hecho que dar de alta un proveedor
revelara que otra empresa cliente ya lo tenía.

## 6 · Retirar no borra a nadie más

`quality_supplier_deletion_verdict` no toca `suppliers` ni `textile_suppliers`
en ninguna de sus ramas, y la prueba L2 lee su cuerpo para comprobarlo. Retirar
un proveedor en Quality termina **la relación como proveedor del sistema de
gestión**; la empresa sigue existiendo para los otros dos módulos, con sus lotes
y sus órdenes intactos.
