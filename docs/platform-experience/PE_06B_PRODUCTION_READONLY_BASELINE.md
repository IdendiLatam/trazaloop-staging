# PE-06B · Producción, tal como está — inventario de solo lectura

*Tomado el **5 de septiembre de 2026, 21:05–21:15 UTC-5**. Proyecto
`mvmpadeixomwkpxbnhky` (`trazaloop-production`), `ACTIVE_HEALTHY`, PostgreSQL
17.6, región `us-west-2`.*

*Este inventario **caduca**. Vale para decidir, no para dar por hecho el día del
corte.*

---

## Cómo se leyó, y por qué eso importa

Cada petición fue un **GET**. Ni un `INSERT`, ni un `UPDATE`, ni un `DELETE`, ni
una sola sentencia DDL. No se enlazó el repositorio a Producción, no se creó
`supabase/.temp/linked-project.json`, y no se cambió ni una variable, ni un
despliegue, ni un secreto.

Los datos salieron por dos caminos, ambos de lectura: el API REST del proyecto
con la llave de servicio —pedida al propio proveedor, usada en memoria y nunca
escrita en ningún fichero— y el CLI de Supabase con el token de la cuenta.

**No se descargó ni un archivo de cliente, y en este documento no aparece ni un
nombre de fichero, ni un correo, ni un dato personal.** Solo cuentas y agregados.

---

## El hecho que cambia el corte

> **Producción tiene 3 empresas.**

PE-06A congeló esta regla: *si `organizations` ≠ 0, el corte exige un ensayo
específico de 0163 sobre el estado comercial real*. Se cumple.

```
PRODUCTION_ORGANIZATION_COUNT = 3
PRODUCTION_CUSTOMER_DATA_ASSUMPTION = REFUTADA
MIGRATION_0163_ACTUAL_DATA_REHEARSAL_REQUIRED = YES   ← hecho en este tramo
```

Y no son empresas vacías: hay **8 órdenes de producción, 10 evidencias, 6
proveedores, 8 materiales, 7 productos y 8 archivos** en el cubo de evidencias.
**Hay trabajo real de cliente en Producción.** Cualquier plan que dijera «no hay
nada que preservar» ya no es cierto.

---

## Cabecera y familias del esquema

Producción está en **0111**, y su forma lo confirma sin necesidad de leer la
tabla de migraciones:

| Familia | Estado | Qué significa |
|---|---|---|
| Núcleo (empresas, personas, módulos) | **presente** | base histórica |
| Comercial heredado (`organization_subscriptions`, `plan_definitions`) | **presente** | el modelo **anterior** a 0163 |
| Comercial PE-04 (`plans`, `plan_revisions`, `organization_plan_assignments`…) | **ausente** | llega con 0162–0168 |
| Facturación PE-05 (`billing_*`, `commercial_fx_rates`) | **ausente** | llega con 0169–0182 |
| Quality (`quality_*`) | **ausente** | llega con 0112 |
| Platform Experience (FAQ, ayuda, tutoriales) | **ausente** | llega con 0155–0161 |
| PCR / Textiles / TrazaDocs | **presente, con datos** | el producto que hoy usan |
| Soporte | presente, **0 tickets** | |

Ausencia esperada no es error: es exactamente lo que debe haber a 0111.

---

## Cuentas

| | |
|---|---|
| `organizations` | **3** |
| `auth.users` | **6** |
| `profiles` | 6 |
| `memberships` | 4 |
| `organization_modules` | **9** |
| `organization_subscriptions` (heredado) | 3 · las tres en `demo` |
| `production_orders` | 8 |
| `input_batches` / `output_batches` | 8 / 6 |
| `evidences` | 10 |
| `suppliers` / `materials` / `products` | 6 / 8 / 7 |
| `recycled_content_calculations` | **3** |
| `calculation_methodologies` | **1** (`RC-6632-15343` v1, activa) |
| `trazadoc_documents` | 3 |
| `textile_*` | 0 |
| `legal_documents` | 4 |
| `platform_staff` | 1 · superadministración activa |
| `support_tickets` | 0 |
| `storage_upload_intents` | 9 |
| `storage_orphan_candidates` | 1 |

---

## Lo que leerá 0163

Nueve filas de módulo, todas **habilitadas**:

| Módulo | `access_mode` | Empresas |
|---|---|---|
| `core` *(no funcional)* | `full` | 3 |
| `textiles` | `demo` · `extra` · `full` | 1 cada uno |
| `traceability_6632` | `demo` · `extra` · `full` | 1 cada uno |

Dos filas llevan `access_expires_at`.

**Cada empresa tiene un modo distinto**, así que Producción ejercita **los tres**
modos que el esquema admite. Y las tres suscripciones heredadas dicen `demo`
aunque dos empresas tengan `full` y `extra` en sus módulos: **la autoridad de
0163 es `organization_modules.access_mode`**, no la suscripción vieja. No es una
contradicción que haya que arreglar; es que el modelo nuevo lee otra cosa.

`quality` existe en el catálogo de módulos y hoy **no es funcional**. 0112 lo
vuelve funcional. Ninguna empresa tiene fila de `quality`, así que 0163 no le
creará nada.

---

## Almacenamiento

| Cubo | Objetos |
|---|---|
| `evidences` | **8** |
| `organization-assets` | 1 |
| `trazadocs-documents` | 1 |
| `tutorial-media` | **no existe** — lo crea 0159 |

Bytes agregados: **DESCONOCIDO**. El listado de solo lectura no los expone y no
se descargó nada para averiguarlo.

---

## Identidades

- **6** usuarios en `auth`.
- **1** superadministración de plataforma, activa.
- No se listaron correos, ni se revocó, ni se desactivó, ni se cambió un papel.
  Retirar identidades de QA es trabajo de PE-06D.

---

## Copias de seguridad — y aquí hay un problema

Leído del proyecto, solo lectura:

```
walg_enabled  : true
pitr_enabled  : false      ← la recuperación a un punto en el tiempo está APAGADA
backups       : []         ← no hay copias físicas listadas
```

Las migraciones **no tienen vuelta atrás**. Con PITR apagado y sin copia física
listada, **hoy no existe un punto de restauración demostrable** para Producción.
Y una copia lógica previa al corte necesita la contraseña de la base, que no está
en esta máquina.

**Esto no cierra la puerta de las copias: la agrava.** Antes de migrar hay que
encender PITR o tomar y **verificar** una copia lógica.

---

## Lo que implica para el corte

1. **0163 dejó de ser una migración vacía.** Actuará sobre tres empresas reales.
   Su ensayo con esta forma exacta está en
   [`PE_06B_MIGRATION_REHEARSAL.md`](PE_06B_MIGRATION_REHEARSAL.md).
2. **0147 no borrará nada**: su única metodología está referenciada por tres
   cálculos, así que toma el camino seguro documentado.
3. **Hay datos de cliente que preservar.** El corte deja de ser «desplegar sobre
   una base vacía».
4. **Sin copia verificada no se migra.**
5. Este inventario **se vuelve a tomar** justo antes del corte.

```
PRODUCTION_DATA_RECHECK_REQUIRED_AT_CUTOVER = YES
```
