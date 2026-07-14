# Trazaloop · Guía de importación masiva por CSV (Sprint 7)

Esta guía explica cómo cargar datos **reales** de una empresa en Trazaloop
usando archivos CSV, desde `/imports`. No describe un caso piloto ni datos
de demostración: las plantillas están vacías a propósito y el importador no
crea nada automáticamente — cada fila la trae la propia empresa.

## 1. Qué puede importarse

Diez entidades, en este orden recomendado (cada una depende de que las
anteriores ya existan):

1. Proveedores
2. Materiales
3. Evidencias (solo metadatos)
4. Familias de producto
5. Productos
6. Lotes de entrada
7. Órdenes / corridas de producción
8. Consumos de lotes de entrada
9. Lotes producidos / lotes finales
10. Composición de lotes producidos

## 2. Qué NO puede importarse

- **Archivos de evidencia.** El CSV de evidencias solo crea *metadatos*
  (nombre, tipo, fecha, responsable, vigencia, observaciones). El archivo
  físico se sube desde **Evidencias** en la UI, no desde CSV.
- **El estado `valid` de una evidencia.** Toda evidencia importada queda en
  el estado inicial (`pending`, pendiente); validarla es un acto de
  aprobación que solo puede hacer admin o calidad desde la UI de
  Evidencias.
- **`organization_id`.** Un archivo que traiga esa columna (o variantes
  como `org_id`) se **rechaza completo**: la organización siempre es la
  empresa activa de tu sesión.
- **Datos de otra empresa.** Ningún nombre/código referenciado (proveedor,
  material, evidencia, orden, lote, producto) puede resolver a un registro
  de otra organización; si no existe en tu empresa activa, la fila queda en
  error o advertencia según la regla de esa relación (ver §8).
- **Sobrescritura de datos existentes.** Ver §7 (modo "crear solamente").
- **Recalculo automático de contenido reciclado.** Importar composición no
  dispara el cálculo: sigue siendo una acción explícita en Contenido
  reciclado.
- **Casos de demostración.** No hay importador de datos demo: solo existe
  esta ruta de datos reales.

## 3. Cómo descargar plantillas

En `/imports` → **Plantillas disponibles** → «Descargar plantilla» por cada
entidad. Los archivos son estáticos (`/public/templates/imports/*.csv`),
solo traen encabezado — sin filas de ejemplo ni datos ficticios.

## 4. Cómo llenar las plantillas

Reglas generales:

- Guarda el archivo como **CSV UTF-8** (máximo 2 MB, 5000 filas por carga).
- No agregues ni quites columnas del encabezado (columnas de más se
  ignoran; columnas obligatorias que falten rechazan el archivo completo).
- Los campos de texto van tal cual; los numéricos aceptan punto o coma
  decimal; las fechas van en formato `AAAA-MM-DD`.
- Las columnas que referencian otro registro (por ejemplo
  `supplier_name` en lotes de entrada) deben coincidir **exactamente** con
  el nombre/código ya existente en tu empresa (sin distinguir mayúsculas).

### Columnas por entidad

Las columnas de cada plantilla están adaptadas al esquema real de
Trazaloop (no a una lista genérica). Notas de adaptación respecto a un
diseño “de brief”:

- **Proveedores** (`supplier_name, tax_id, contact`): el esquema solo tiene
  un campo de contacto libre; no existen columnas separadas de
  nombre/correo/teléfono de contacto.
- **Materiales** (`material_name, classification_code,
  origin_evidence_name`): sin `material_type` ni `observations` (no existen
  en la tabla). `origin_evidence_name` es el nombre EXACTO de una evidencia
  ya existente para usarla como soporte de origen; si no se encuentra, el
  material se crea igual con una **advertencia** (no bloquea).
- **Evidencias** (`evidence_name, evidence_type, evidence_date,
  responsible, valid_until, observations`): ver §2, solo metadatos.
- **Familias de producto** (`family_name, description`).
- **Productos** (`product_name, product_code, product_family_name,
  declared_recycled_percent`): sin `description` (no existe en la tabla);
  se agrega `declared_recycled_percent` (0–100), campo real que el motor de
  cálculo usa para la advertencia de riesgo declarado-vs-calculado.
- **Lotes de entrada** (`batch_code, supplier_name, material_name,
  residue_type, provenance, received_date, quantity_kg, storage_location,
  notes`): mismas columnas que el importador de catálogos ya existente
  (Sprint 3), para no tener dos formatos distintos del mismo archivo.
- **Órdenes / corridas de producción** (`production_order_code,
  production_date, pretreatment, notes`): sin `product_name` (el producto
  se asocia en el LOTE PRODUCIDO, no en la orden) ni `line_or_machine` (no
  existe); se usa `pretreatment`, columna real.
- **Consumos** (`production_order_code, input_batch_code, mass_kg,
  notes`): ambos códigos deben existir ya.
- **Lotes producidos / lotes finales** (`output_batch_code,
  production_order_code, product_code, production_date,
  produced_quantity_kg, notes`): el producto se referencia por
  `product_code` (clave única real), no por nombre; `declared_recycled_percent`
  NO es columna de este archivo (es del producto, ya cubierta arriba).
- **Composición** (`output_batch_code, material_name, mass_kg,
  is_same_process, notes`): se agrega `is_same_process` (true/false,
  sí/no, 1/0) — alimenta directamente la regla del motor "mismo proceso no
  cuenta como reciclado".

## 5. Cómo validar antes de importar

En `/imports`, sección **Subir y validar archivo**:

1. Elige el tipo de entidad.
2. Sube el archivo o pega el contenido CSV.
3. «Validar archivo»: el servidor lee, valida encabezado, tipos, campos
   obligatorios, relaciones dentro de tu empresa activa y duplicados —
   **sin escribir nada todavía**.
4. Revisa la vista previa y los errores/advertencias por fila.
5. Si no hay errores, «Confirmar importación» queda habilitado.

## 6. Qué significan errores y advertencias

- **Error** (bloquea toda la confirmación hasta corregir): campo
  obligatorio faltante, tipo de dato inválido (fecha, número, porcentaje
  fuera de rango, masa ≤ 0), referencia obligatoria inexistente (por
  ejemplo un `supplier_name` que no existe), o fila duplicada **dentro del
  mismo archivo**.
- **Advertencia** (no bloquea; la fila se importa o se omite igual): una
  referencia **opcional** no encontrada (por ejemplo
  `origin_evidence_name`), o un registro que **ya existe** en tu empresa
  (se omite, ver §7).

Mientras haya al menos un error, el botón «Confirmar importación» queda
deshabilitado.

## 7. Cómo se manejan los duplicados (modo "crear solamente")

Regla elegida para el Sprint 7, documentada explícitamente como pide el
diseño (Parte 6, opción 5 del brief):

- Si el natural key de la fila (nombre, código, o par de códigos según la
  entidad) **ya existe** en tu empresa, la fila se marca como
  **advertencia** "ya existe: se omite" y **se omite** al confirmar — no se
  crea un duplicado ni se sobrescribe el registro existente.
- Ningún dato existente se actualiza ni se borra desde el importador.
- Un duplicado **dentro del mismo archivo** (misma clave dos veces) sí es
  **error**, porque no hay forma segura de saber cuál de las dos filas
  debería prevalecer.
- Las evidencias son la única excepción: no tienen una clave única de
  nombre en el esquema, así que cada fila crea una evidencia
  independiente, igual que crear varias evidencias desde la UI.

## 8. Cómo se manejan las relaciones entre archivos

Cada entidad que referencia otra (por nombre o código) exige que el
registro referenciado **ya exista en tu empresa activa**, salvo dos
excepciones explícitas donde la relación es opcional y una referencia no
encontrada solo genera advertencia: `origin_evidence_name` en materiales, y
`product_code` en lotes producidos / lotes finales (el lote se crea sin
producto asociado). En el resto de los casos (proveedor y material en
lotes de entrada; orden y lote en consumos; orden en lotes producidos;
lote y material en composición; familia en productos) la referencia es
**obligatoria**: si no existe, la fila queda en error.

## 9. Qué debe existir antes de importar consumos o composición

- **Antes de consumos**: la orden / corrida (`production_order_code`) y el
  lote de entrada (`input_batch_code`) referenciados.
- **Antes de composición**: el lote producido / lote final
  (`output_batch_code`) y el material (`material_name`) referenciados.
- **Antes de lotes producidos**: la orden / corrida referenciada
  (`production_order_code` es obligatoria: el esquema exige que todo lote
  de salida pertenezca a una orden).

Por eso el orden recomendado de §1 importa: cargar en ese orden evita casi
todos los errores de referencia.

## 10. `organization_id` nunca se acepta desde archivo

Ver §2. La organización activa se resuelve siempre en el servidor
(`requireActiveOrg`), nunca desde el CSV ni desde ningún campo enviado por
el cliente entre el paso de validar y el de confirmar.

## 11. Las evidencias importadas son solo metadatos

Ver §2 y §6. Cárgalas por CSV para tener el registro (nombre, tipo, fecha,
responsable, vigencia, observaciones) y luego:

1. Sube el archivo real desde **Evidencias**.
2. Valídala (admin o calidad) cuando corresponda.
3. Asóciala como soporte de origen del material si aplica (o usa
   `origin_evidence_name` al importar materiales, si la evidencia ya
   existía antes).

## 12. El archivo de evidencia se sube desde Evidencias, no desde CSV

Ver §2 y §11. No hay forma de adjuntar un archivo dentro de un CSV: el
importador de evidencias solo escribe los campos de texto de la tabla
`evidences`.

## 13. No se crean datos de demostración

`/imports` no tiene importador de demo, no crea un caso piloto y no genera
filas automáticas de ningún tipo. Toda fila que se crea proviene de una
fila real del archivo subido por la empresa.

> **Nota técnica interna** (no forma parte del flujo con empresas reales):
> para pruebas internas aisladas del equipo de Trazaloop existen guiones
> técnicos aparte (`npm run seed:demo`, `docs/DEMO_FLOW.md`). No se
> recomiendan ni se usan como parte de la implementación con una empresa.

## Seguridad multiempresa

- `organization_id` nunca viaja desde el cliente (§10).
- Todas las consultas de referencia (¿existe este proveedor?, ¿existe esta
  evidencia?) se acotan siempre a la empresa activa.
- Solo los roles **admin**, **quality** o **consultant** pueden validar o
  confirmar una importación (impuesto también por RLS en
  `import_job_rows`).
- El paso de confirmar **repite toda la validación** contra el estado
  actual de la base antes de escribir: si algo cambió entre validar y
  confirmar (por ejemplo, otro usuario importó lo mismo mientras tanto), se
  detecta y se pide volver a validar — nunca se confía en datos "viejos"
  enviados por el cliente.
- El historial de importaciones (`import_jobs`) es append-only, igual que
  desde el Sprint 2: cada validación y cada confirmación quedan como un
  evento propio e inmutable.

## Comandos relacionados

```bash
npm run test:imports   # lógica pura de parseo/validación (sin BD)
npm run test:rls       # aislamiento multiempresa de import_job_rows (Supabase local)
```
