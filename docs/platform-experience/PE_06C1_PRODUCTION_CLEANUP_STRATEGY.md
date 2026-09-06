# PE-06C1 · Cómo se limpia Producción antes del corte

*6 de septiembre de 2026. Producción sigue en **0111** y en este tramo solo se
leyó: cada petición fue un GET, no se borró ni una fila, ni se cambió una
variable, ni se desplegó nada.*

---

## Lo que cambia respecto a PE-06B

PE-06B encontró tres empresas en Producción con órdenes, lotes, evidencias y
archivos, y concluyó —correctamente con lo que se sabía— que **había datos de
cliente que preservar**.

El dueño de producto ha aclarado que **las tres son empresas de prueba**:

```
PRODUCTION_CUSTOMER_DATA_TO_PRESERVE       = NO
PRODUCTION_TEST_ORGANIZATIONS_DISPOSABLE   = YES
PRODUCTION_TEST_TENANT_DATA_DISPOSABLE     = YES
PRODUCTION_TEST_STORAGE_OBJECTS_DISPOSABLE = YES
```

**El hallazgo de PE-06B no se borra: se reclasifica.** Los datos siguen ahí y
siguen siendo exactamente los que se inventariaron; lo que cambia es que ahora
sabemos que no hay que conservarlos. Y la decisión vale **solo** para esas tres
empresas y lo que cuelga de ellas: no convierte en desechable todo lo que hay en
Producción.

Las tres son «Juanaradelac», «Empresa de Prueba 1» y «animaná».

---

## Lo global, que NO se toca

| Familia | Qué hay | Clasificación |
|---|---|---|
| `legal_documents` | 4 filas: términos y privacidad, **v1 archivada y v2 activa**, publicadas el 25 y el 28 de julio | **PRESERVAR** |
| `platform_staff` | 1 superadministración activa | **PRESERVAR** |
| `audit_log` | 72 filas | **PRESERVAR** — append-only |
| `modules` · `roles` · `plan_definitions` | 6 · 3 · 3 | RECREABLE DESDE MIGRACIONES |
| `calculation_methodologies` | 1 (`RC-6632-15343` v1) | RECREABLE DESDE MIGRACIONES |
| Catálogos globales (fibras base, marcos, requisitos, diagnósticos…) | — | RECREABLE DESDE MIGRACIONES |
| Cubo `tutorial-media` | **no existe** todavía | lo crea 0159 |

**Los documentos legales son el único estado global que no se puede rehacer.** Se
publicaron **en Producción**, con tres días de diferencia entre v1 y v2, y las
migraciones que Producción no tiene todavía no los reproducen. Si se perdieran,
se perdería la historia de qué se aceptó y cuándo.

---

## Las identidades

Seis cuentas. La decisión sobre las empresas **no** las convierte en desechables.

| | Clasificación | Nota |
|---|---|---|
| `idendilatam@gmail.com` | **PLATAFORMA** | Es la superadministración de Producción, y **existe** |
| una cuenta `gmail.com` | INQUILINO DE PRUEBA | admin de una empresa de prueba |
| una cuenta `gmail.com` | INQUILINO DE PRUEBA | admin de otra |
| una cuenta `idendi.org` | INQUILINO DE PRUEBA | papel `quality` en «Juanaradelac» |
| una cuenta `gmail.com` | SIN EMPRESA | no pertenece a ninguna |
| una cuenta **externa** (`getconectarecicla.cl`) | **SIN EMPRESA · REVISAR** | dominio de un tercero |

**Dos cosas que conviene mirar antes de decidir nada sobre cuentas:**

1. La superadministración prevista **es también `admin` de «Empresa de Prueba 1»**.
   Eso **no bloquea** la limpieza: su papel de plataforma vive en
   `platform_staff`, que no tiene `organization_id` y por tanto la limpieza **no
   la alcanza**. Lo que sí pasa es que, tras limpiar, esa persona entrará sin
   ninguna empresa y tendrá que crear una por el producto. Conviene saberlo antes
   de que ocurra, no después.
2. Hay **una cuenta de un dominio externo sin empresa**. La decisión del dueño de
   producto habla de empresas de prueba, no de personas. **Esa cuenta no se toca
   en el corte** sin una decisión aparte.

```
CANONICAL_SUPERADMIN_PRESENT = YES
CUTOVER_DEPENDS_ON_TEST_TENANT_USERS = NO
```

---

## El almacenamiento

| Cubo | Objetos | Dueño |
|---|---|---|
| `evidences` | 8 | **empresa de prueba** — todos bajo el prefijo de «Juanaradelac» |
| `organization-assets` | 1 | empresa de prueba |
| `trazadocs-documents` | 1 | empresa de prueba |

Las **9 intenciones de subida** pertenecen las nueve a empresas de prueba, y
**ninguna empresa declara logo**. No hay ni un objeto de plataforma mezclado: el
prefijo del identificador de empresa distingue unos de otros sin ambigüedad, que
es justo lo que hace seguro un borrado por prefijo.

---

## El grafo de dependencias

Medido sobre el esquema, no adivinado:

| | A **0111** | A **0182** |
|---|---|---|
| Tablas con `organization_id` | **98** | **339** |
| Claves foráneas directas a `organizations` | **62** — 60 `RESTRICT`, 2 `CASCADE` | más |
| Disparadores que reaccionan a un borrado | **69** | **201** |

Que 60 de 62 sean `RESTRICT` es importante: **no hay cascada ciega**. Cada
dependiente tiene que vaciarse antes, en orden, y el orden se descubre solo
repitiendo el barrido hasta que no queda nada.

### Dos tablas se niegan a que las borren

El ensayo lo descubrió al primer intento, y las dos por el mismo candado
genérico `forbid_mutation`:

- **`audit_log`** · append-only. Registra lo que **pasó**, no lo que una empresa
  guardó. Y **no tiene clave foránea a `organizations`**, así que puede quedarse
  donde está: la empresa se va y su rastro permanece como historia de plataforma.
  Borrarlo sería destruir el registro de la propia limpieza. **Se excluye.**
- **`recycled_content_calculations`** · un cálculo de trazabilidad es evidencia,
  y el producto se niega a reescribirlo o borrarlo. Para purgar un inquilino de
  **prueba** hay que bajar ese candado **a propósito**, dentro de la misma
  transacción y volviéndolo a subir. Se hace explícito porque es exactamente la
  clase de cosa que no debe pasar en silencio.

---

## ¿Existe ya una purga canónica?

```
CANONICAL_TENANT_PURGE_EXISTS = NO   (como operación de base de datos)
CANONICAL_TENANT_PURGE_SCRIPT = SÍ   (scripts/release/v1/cleanup-staging.ts)
```

Y el guion existente es **mejor de lo que esperaba**:

- **deriva las tablas del esquema real** —toda tabla de `public` con
  `organization_id`—, así que una tabla nueva queda cubierta sola;
- borra los archivos de todos los cubos;
- borra usuarios de Auth y perfiles **salvo** los de `KEEP_AUTH_EMAILS`;
- preserva catálogos globales, `modules`, `plan_definitions`,
  `calculation_methodologies`, `roles`, **`legal_documents`** y la
  superadministración con su fila en `platform_staff`;
- es **seco por defecto**, falla cerrado, y **exige una lista blanca de
  Staging**.

Esa última línea es la que impide usarlo tal cual: **se niega a apuntar a
Producción, y esa negativa no se debilita**. Lo correcto es una puerta separada,
con su propio nombre, su propia lista blanca y su propia confirmación —trabajo de
PE-06C2—, no quitarle el candado a la de Staging.

---

## Limpiar antes o migrar antes

**Las dos funcionan.** Se ensayaron las dos, y conviene decirlo así en vez de
presentar la recomendación como la única posible.

| | **Limpiar → migrar** | Migrar → limpiar |
|---|---|---|
| Filas de inquilino a borrar | **23** | **35** |
| Tablas con `organization_id` en juego | **98** | **339** |
| Disparadores de borrado en la base | **69** | **201** |
| Qué hace 0163 | **0 asignaciones** | crea **12** que luego se borran |
| Candados que hay que bajar | 1 | 1 |
| Resultado del ensayo | limpio | limpio |

### Recomendación

```
PRODUCTION_CLEANUP_STRATEGY = CLEAN_BEFORE_MIGRATION
```

No porque la otra falle —no falla—, sino porque:

1. **Un tercio de superficie.** 98 tablas contra 339, y 69 disparadores contra
   201. Menos sitio donde equivocarse.
2. **0163 no trabaja para nada.** Sobre una base sin empresas crea **cero**
   asignaciones. En el otro orden crea doce filas de historia comercial para
   empresas que van a desaparecer, y luego hay que deshacerlas.
3. **La cadena se aplica sobre lo más simple posible**, que es como conviene dar
   un salto de 71 migraciones en la base viva.

---

## El ensayo

Bases desechables, nunca Producción.

**Limpieza a 0111**, sobre la forma exacta de Producción:

```
23 filas de empresa borradas en 2 vueltas
INQUILINO · empresas 0 · pertenencias 0 · módulos 0 · órdenes 0 · cálculos 0 · intenciones 0
GLOBAL    · legales 2 · metodologías 1 · módulos 6 · roles 3 · planes 3 · perfiles 6
HISTORIA  · audit_log 72   ← intacto
```

**Y después, la cadena:**

```
0112 → 0182 : 71 migraciones · 0 fallos · 12 s
0163 creó 0 asignaciones
405 tablas · 0 sin RLS · quality funcional = true
legales 2 · audit_log 72   ← siguen ahí
```

**Contra-ensayo (migrar y luego limpiar):** también sale limpio —71 migraciones,
12 asignaciones creadas, 35 filas borradas después—. Se deja constancia porque
una recomendación que oculta que la alternativa funciona no es una
recomendación, es una imposición.

---

## La forma esperada justo antes de migrar

Con los números reales del inventario:

| | Antes | Después de limpiar |
|---|---|---|
| `organizations` | 3 | **0** |
| `memberships` | 4 | **0** |
| `organization_modules` | 9 | **0** |
| órdenes · lotes · evidencias | 8 · 14 · 10 | **0** |
| proveedores · materiales · productos | 6 · 8 · 7 | **0** |
| `recycled_content_calculations` | 3 | **0** |
| `storage_upload_intents` | 9 | **0** |
| objetos en cubos | 8 · 1 · 1 | **0** |
| `legal_documents` | 4 | **4** |
| `platform_staff` | 1 | **1** |
| `audit_log` | (n) | **(n)**, intacto |
| `calculation_methodologies` · `modules` · `roles` · `plan_definitions` | 1 · 6 · 3 · 3 | iguales |
| Cuentas de Auth | 6 | **decisión aparte** |

---

## Volver a mirar el día del corte

```
PRODUCTION_DATA_RECHECK_REQUIRED_AT_CUTOVER = YES
```

Justo antes de limpiar hay que comprobar que **sigue habiendo tres empresas y son
las tres conocidas**, que no ha aparecido ninguna nueva, y que no hay objetos de
almacenamiento inesperados.

> **Si aparece un cliente real, el corte para.** La decisión de que estos datos
> son desechables vale para tres empresas concretas, no para las que vengan.

---

## Copias de seguridad, releída

PE-06B encontró `pitr_enabled = false` y `backups: []`, y lo clasificó como
**NO-GO**. Con la decisión nueva hay que separar dos riesgos que antes iban
juntos:

| Riesgo | Con la decisión nueva |
|---|---|
| Pérdida de datos de inquilino | **deja de importar**: son desechables y de hecho se van a borrar |
| Pérdida de estado global/plataforma | **sigue importando** |

Y el estado global que importa es **pequeño y conocido**: 4 documentos legales,
1 fila de plataforma, el registro de auditoría y 6 cuentas. Todo lo demás lo
rehacen las migraciones.

Por eso:

```
PRODUCTION_BACKUP_EVIDENCE_MISSING = DEGRADADO_DE_NO_GO_A_RECOMENDACIÓN
PITR_CUTOVER_BLOCKER = NO
PITR_RECOMMENDED = YES
```

**Pero no se degrada gratis.** Se degrada **a cambio** de un control más barato y
más adecuado, que sí es obligatorio:

### Exportación lógica de lo que se preserva

Antes de tocar nada, exportar a un fichero fuera de Producción:

- `legal_documents` (las 4 filas, con su texto y sus fechas) — **lo único
  irrepetible**;
- `platform_staff`;
- `audit_log`;
- el listado de cuentas de Auth con su identificador y fecha de alta.

Sin secretos, sin llaves, sin datos de tarjeta. Son cuatro tablas pequeñas y una
lista. Eso es una red proporcionada al riesgo real; una copia completa del
proyecto, no.

```
GLOBAL_STATE_LOGICAL_EXPORT_REQUIRED = YES   ← nuevo bloqueante, barato
```

*Nota práctica:* esa exportación necesita la contraseña de la base de Producción
o el panel, y **no está en esta máquina**. Es trabajo de PE-06C2.

---

## Reiniciar el proyecto: NO

Evaluado y **rechazado**:

- `db reset` remoto, recrear el proyecto de Supabase, borrar esquemas o
  reemplazar la base entera.

**Por qué no:** perdería los documentos legales publicados, el registro de
auditoría, las cuentas de Auth —incluida la externa—, la configuración del
proyecto, la de Storage y la identidad del propio proyecto, que es a lo que
apunta la aplicación desplegada. Todo eso a cambio de ahorrarse un barrido de 23
filas. **La limpieza selectiva es más pequeña y menos arriesgada que empezar de
cero.**

---

## Efectos en el acceso

Tras limpiar y antes de migrar:

- **Entrar sigue funcionando**: las cuentas de Auth no se tocan.
- **La superadministración sigue siéndolo**: `platform_staff` no tiene
  `organization_id` y la limpieza no la alcanza.
- **El selector de módulos quedará vacío** para esa persona, porque ya no
  pertenecerá a ninguna empresa. Crear una por el producto es el camino normal.
- La aceptación legal y el acceso a soporte no dependen de las empresas
  borradas.

---

## Quality

`QUALITY_MODULE_PRODUCTION_DECISION = ENABLE_AT_CUTOVER`, congelada. La limpieza
**no crea ni destruye** derechos de Quality: ninguna empresa de Producción tiene
fila de `quality`, y sobre una base sin empresas 0163 no crea ninguna. Lo único
que cambia es que 0112 marca el módulo como funcional en el catálogo; que se vea
lo sigue decidiendo `QUALITY_MODULE_ENABLED`, que se pondrá en el corte.

---

## Lo que este tramo NO hizo

Ni migración nueva —no hace falta ninguna—, ni implementación de la purga, ni
aviso de `provider_unknown`, ni nada de Wompi, planificador o impuestos.
