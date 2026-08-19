# Q0_1_REMOTE_VERIFICATION

**Sprint:** Q0.1 — Remote Read-Only Verification
**Fecha:** 2026-08-18
**Objetivo:** resolver **DR-01** (estado real del esquema desplegado) y **DR-02**
(`ACTIVE_ORG_COOKIE_SECRET` en producción).
**Alcance:** estrictamente **READ-ONLY**. Ninguna corrección, ninguna migración, ningún cambio de
producción.

---

## 0. Nota de transparencia sobre el método

Dos cosas deben quedar registradas antes de las conclusiones.

**0.1 · El CLI de Supabase inicializa un rol de sesión al conectar.**
Cada invocación de `supabase migration list --linked` y `supabase db dump --linked` imprimió
`Initialising login role...`. Ese es el mecanismo propio del CLI para abrir una sesión de lectura
contra un proyecto vinculado cuando no hay contraseña almacenada en el comando. **No ejecuté DDL
ni ninguna sentencia de escritura**, pero la herramienta tocó estado remoto por su cuenta como
parte de su ruta de lectura estándar. Lo señalo porque el encargo prohibía DDL y prefiero
declararlo a omitirlo. No se creó, alteró ni borró ningún objeto de negocio.

**0.2 · Barrera de escritura verificada antes de intentar conexión directa.**
Antes de cualquier intento por `psql` fijé `PGOPTIONS=-c default_transaction_read_only=on` y probé
la barrera con una sentencia de creación que **debía** fallar. La conexión directa no llegó a
establecerse por el motivo del §3, así que la barrera nunca se ejerció; el trabajo se realizó
íntegramente con `pg_dump` a través del CLI, que es de solo lectura por naturaleza.

**Operaciones prohibidas: ninguna ejecutada.** Sin `db push`, `db reset`, `migration repair`,
INSERT/UPDATE/DELETE, DDL, deploy, cambios de entorno, Auth, Storage, commits ni push.

---

## 1. Proyecto Supabase remoto identificado

| Dato | Valor |
|---|---|
| Project ref | `mvmpadeixomwkpxbnhky` |
| Nombre | **trazaloop-production** |
| Organización | `mjrmschzqbrvjvecvtfv` |
| Región | `aws-1-us-west-2` |
| PostgreSQL | **17.6.1.147** |
| GoTrue (Auth) | v2.195.0 |
| PostgREST | v14.5 |
| Storage | v1.69.0 |
| Vínculo | `supabase/.temp/linked-project.json` |

Proyecto Vercel asociado: `trazaloop-production` (`prj_6MqJAfAhXdEGe9KHH90vVq3Qw0cy`,
org `team_QTJuXk4bOQr9mqe8wnn8XMaI`).

**El entorno inspeccionado es PRODUCCIÓN.** Todo el trabajo se hizo en consecuencia.

---

## 2. Estado de migraciones

Fuente: `supabase migration list --linked` (lectura de `supabase_migrations.schema_migrations`).

| Métrica | Valor |
|---|---|
| Migraciones locales | **102** |
| Migraciones remotas | **102** |
| Pares `local == remote` | **102 / 102** |
| Migraciones locales NO aplicadas | **0** |
| Migraciones remotas ausentes en local | **0** |

Rango verificado: `0001`–`0006` y `0015`–`0110`, todas con correspondencia exacta.

**Resultado: historial de migraciones perfectamente alineado.**

---

## 3. Hallazgo nuevo — el entorno local apunta a un proyecto Supabase inexistente

Este hallazgo no existía en Q0 y es el más relevante de Q0.1.

`.env.local` está encabezado por `# Created by Vercel CLI`: fue generado con `vercel env pull`, que
por defecto descarga el entorno **Development**. Sus variables apuntan a:

| Variable | Proyecto al que apunta |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `dtrxxqmdweykzncfmahc` |
| `SUPABASE_DB_URL` | `db.dtrxxqmdweykzncfmahc.supabase.co` |
| Vínculo del repositorio (`supabase/.temp`) | `mvmpadeixomwkpxbnhky` |

**Son proyectos distintos, y el primero ya no existe.** Comprobación DNS:

```text
supabase.com                          RESUELVE      (control)
aws-1-us-west-2.pooler.supabase.com   RESUELVE      (control)
mvmpadeixomwkpxbnhky.supabase.co      A    172.64.149.246
db.mvmpadeixomwkpxbnhky.supabase.co   AAAA 2600:1f14:90b:6002:…
dtrxxqmdweykzncfmahc.supabase.co      sin registro
db.dtrxxqmdweykzncfmahc.supabase.co   sin registro
```

Y la API REST:

```text
https://mvmpadeixomwkpxbnhky.supabase.co/rest/v1/  → HTTP 401   (vivo, exige credencial)
https://dtrxxqmdweykzncfmahc.supabase.co/rest/v1/  → sin respuesta
```

Descarté que fuera una restricción de red del entorno o el conocido caso del host directo
IPv6-only: el proyecto vinculado resuelve por ambos patrones y responde, mientras que el otro no
tiene **ningún** registro DNS, ni de API ni de base.

**Interpretación:** el entorno **Development** de Vercel conserva credenciales de un proyecto
Supabase retirado. La aplicación en desarrollo local no puede funcionar contra una base real con
ese archivo.

**Lo que este hallazgo NO significa:** no dice nada sobre el entorno **Production** de Vercel. Es
perfectamente posible —y coherente con que la aplicación esté desplegada y viva— que Production
apunte correctamente a `mvmpadeixomwkpxbnhky`. No pude verificarlo (§7).

**Impacto sobre Quality:** ninguno en el modelo de datos. Impacto operativo alto en el arranque de
Q1/Q2: cualquier desarrollo o prueba local contra base fallará hasta que se corrija.
**No corregido.** → **DR-13**.

---

## 4. Numeración faltante 0007–0014 — RESUELTA

Cuatro comprobaciones independientes, todas coincidentes:

| Comprobación | Resultado |
|---|---|
| Historial remoto de migraciones | Ninguna entrada 0007–0014 |
| `git log --diff-filter=A` sobre `supabase/migrations/` | **Nunca se añadió** ningún archivo 0007–0014 |
| `git log --diff-filter=D` sobre `supabase/migrations/` | **Ninguna migración fue borrada jamás** |
| Referencias textuales en migraciones y docs | Ninguna |

El primer commit que introduce migraciones (`c556638 Trazaloop staging Sprint 3.1.1`) ya contenía
19 archivos, con el hueco presente.

**Conclusión: las migraciones 0007–0014 nunca existieron.** El salto de numeración se produjo
durante el desarrollo previo a la incorporación del proyecto a Git y no corresponde a migraciones
retiradas, perdidas ni aplicadas fuera del repositorio. **No es un gap real.**

Q0 lo había marcado como `DESCONOCIDO / REQUIERE VALIDACIÓN`. Queda cerrado.

---

## 5. Verificación estructural del esquema remoto

Fuente: `supabase db dump --linked --schema public` (20.178 líneas) y `--schema storage`
(1.318 líneas). `pg_dump` es de solo lectura y no incluye datos de negocio.

### 5.1 Recuento comparado

| Objeto | Remoto | Local | Veredicto |
|---|---|---|---|
| Tablas (`public`) | **87** | 87 | Conjuntos **idénticos** |
| Vistas | **33** | 33 | Conjuntos **idénticos** |
| Funciones | **146** | 147 declaradas | Explicado (§5.2) |
| Triggers | **295** (`public`) | 297 declarados | Explicado (§5.3) |
| Políticas (`public`) | **253** | 253 netas | **Coincidencia exacta** |
| Políticas (`storage.objects`) | **9** | 9 esperadas | **Coincidencia exacta** |
| Tablas con RLS | **87 / 87** | 87 / 87 | **Coincidencia exacta** |

**Objetos presentes en remoto y no explicables por las migraciones: CERO**, en las cinco
categorías (tablas, vistas, funciones, triggers, políticas).

### 5.2 Las 4 funciones de diferencia — todas explicadas

Tres eran un **falso positivo mío**: mi patrón de extracción del volcado remoto usaba `[a-z_]+`,
que excluye dígitos, y por tanto perdía `begin_textile_evidence_upload_v2`,
`finalize_trazadoc_file_document_initial_version_v2` y `replace_trazadoc_file_document_v2`. Las
tres **sí están** en producción. Corregido el patrón, la diferencia real es una sola:

| Función | Situación |
|---|---|
| `guard_evidence_validation` | Creada en 0019, **eliminada en 0023** junto con su trigger. Su ausencia remota es correcta. |

146 remotas = 147 declaradas − 1 legítimamente eliminada.

### 5.3 Los 2 triggers de diferencia — ambos explicados

| Trigger | Situación |
|---|---|
| `on_auth_user_created` | Vive en `auth.users`, **fuera del esquema `public`**. No aparece en un volcado de `public`; su ausencia es esperada, no drift. |
| `t_evidences_guard_validation` | Eliminado en 0023 junto con `guard_evidence_validation`. |

295 remotos en `public` + 1 en `auth` = 296 = 297 declarados − 1 eliminado.

### 5.4 Tablas fundacionales — verificación individual

Todas existen, todas con RLS activa:

| Tabla | RLS | Políticas | Triggers |
|---|---|---|---|
| `organizations` | SÍ | 2 | 3 |
| `profiles` | SÍ | 2 | 1 |
| `memberships` | SÍ | 4 | 4 |
| `roles` | SÍ | 1 | 0 |
| `modules` | SÍ | 1 | 0 |
| `organization_modules` | SÍ | **1** | 2 |
| `platform_staff` | SÍ | 3 | 3 |
| `plan_definitions` | SÍ | 3 | 2 |
| `plan_limits` | SÍ | 3 | 1 |
| `organization_subscriptions` | SÍ | 3 | 2 |
| `subscription_plan_history` | SÍ | 2 | 0 |
| `trazadoc_documents` | SÍ | 4 | 6 |
| `trazadoc_document_sections` | SÍ | 4 | 3 |
| `trazadoc_document_versions` | SÍ | 2 | 2 |
| `trazadoc_status_history` | SÍ | 2 | 0 |
| `trazadoc_blueprints` | SÍ | 3 | 3 |
| `trazadoc_file_documents` | SÍ | 3 | 5 |
| `trazadoc_file_document_versions` | SÍ | 2 | 1 |
| `evidences` | SÍ | 3 | 8 |
| `evidence_links` | SÍ | 4 | 2 |
| `textile_evidences` | SÍ | 3 | 9 |
| `textile_evidence_links` | SÍ | 3 | 6 |
| `frameworks` | SÍ | 1 | 0 |
| `requirements` | SÍ | 1 | 0 |
| `audit_log` | SÍ | 1 | 1 |
| `storage_upload_intents` | SÍ | **0** | 0 |

Dos confirmaciones que merecen destacarse:

- **`organization_modules` tiene exactamente 1 política** (solo `SELECT`). Confirma en producción
  que 0100 eliminó las de `INSERT`/`UPDATE`: una empresa no puede asignarse un plan a sí misma.
- **`storage_upload_intents` tiene RLS activa y CERO políticas** — denegación total por defecto.
  Ningún cliente puede leer ni escribir la tabla de reservas; solo las RPC server-only. Es
  exactamente el diseño que Q0 describió, confirmado en el entorno real.

### 5.5 Políticas de Storage en producción

Las 9 políticas sobre `storage.objects`, y `ALTER TABLE "storage"."objects" ENABLE ROW LEVEL
SECURITY` confirmado:

| Política | Operación | Predicado |
|---|---|---|
| `evidences_select` | SELECT | `is_org_member(safe_uuid(...))` |
| `evidences_insert_cpr` | INSERT | intent exacto vía `storage_object_matches_upload_intent` |
| `evidences_insert_textiles` | INSERT | predicado propio de 0099 (`EXISTS`) |
| `trazadocs_documents_select` | SELECT | `is_org_member((...)::uuid)` |
| `trazadocs_documents_insert_intent` | INSERT | intent exacto |
| `organization_assets_select` | SELECT | `is_org_member((...)::uuid) OR is_platform_staff()` |
| `organization_assets_insert` | INSERT | `is_org_admin((...)::uuid)` |
| `organization_assets_update` | UPDATE | `is_org_admin((...)::uuid)` |
| `organization_assets_delete` | DELETE | `is_org_admin((...)::uuid)` |

**No existe ninguna política de DELETE ni UPDATE sobre los buckets `evidences` ni
`trazadocs-documents`.** La eliminación física queda reservada al flujo server-only, tal como 0101
diseñó. Denegación por defecto confirmada en producción.

### 5.6 Módulo `quality` en producción — verificado indirectamente

No leí filas de la tabla `modules`: el CLI no admite volcar datos de una tabla concreta, y un
volcado de datos completo habría leído información de clientes, fuera del alcance autorizado.

La verificación es **estructural e indirecta, pero concluyente**:

- la migración **0100 está confirmada como aplicada** en remoto;
- la columna `modules.is_functional` **existe en producción** con su `COMMENT` literal de 0100,
  que dice textualmente: *"core/docs/quality/construccion = false; traceability_6632 (CPR) y
  textiles = true"*;
- 0100 inserta la fila `quality` con `is_available = false` y fija `is_functional = false` para
  todo lo que no sea CPR ni Textiles;
- `organization_modules` tiene en producción `access_mode`, `access_expires_at` y
  `assignment_source` con sus `CHECK` exactos.

Se confirma que Quality existe en producción como **placeholder de catálogo, no funcional**, tal
como concluyó Q0. Clasificación de la evidencia: **verificado indirectamente vía DDL y migración
aplicada**, no por lectura de fila.

---

## 6. Clasificación de drift

### **A. ALINEADO**

Repositorio, historial remoto de migraciones y esquema remoto coinciden.

- 102/102 migraciones aplicadas, sin migraciones remotas desconocidas.
- Conjuntos de tablas y vistas idénticos.
- Cero funciones, triggers o políticas en remoto sin explicación en migraciones.
- RLS 87/87 en producción.
- Políticas de `public` y de `storage.objects` con coincidencia exacta.

**No se detectó drift de esquema, ni destructivo ni no destructivo.**

La única divergencia encontrada en todo Q0.1 **no es drift de esquema** sino de **configuración de
entorno** (§3): el entorno Development de Vercel apunta a un proyecto Supabase que ya no existe.
Se clasifica aparte porque no afecta al esquema desplegado.

---

## 7. DR-02 — `ACTIVE_ORG_COOKIE_SECRET`

| Entorno | Resultado |
|---|---|
| Vercel **Development** | **EXISTS** — presente en `.env.local`, archivo generado por `vercel env pull` (cabecera `# Created by Vercel CLI`). Definida y no vacía. **Valor no leído, no impreso, no almacenado.** |
| Vercel **Production** | **NOT DETERMINABLE** |

**Motivo de la indeterminación:** el CLI de Vercel **no está instalado** en esta máquina, y no lo
instalé porque hacerlo es una modificación del sistema fuera del alcance de una verificación
read-only, y además requeriría autenticación interactiva. Sin `vercel env ls production` o acceso
al panel, la existencia de la variable en Production no es verificable desde el repositorio.

**Advertencia asociada:** dado que el entorno Development contiene credenciales de un proyecto
Supabase retirado (§3), no debe asumirse que Production esté correctamente configurado solo porque
Development contenga la variable. Ambos entornos merecen revisión.

DR-02 queda **parcialmente resuelto**. → sigue abierto para Production.

---

## 8. Revisión de las conclusiones de Q0

| Conclusión Q0 (local) | Verificación remota | Cambio |
|---|---|---|
| 87 tablas | **87 confirmadas** | Ninguno |
| 33 vistas | **33 confirmadas** | Ninguno |
| RLS en 87/87 tablas | **87/87 confirmado en producción** | Ninguno — **reforzado** |
| 147 funciones | 146 en producción; la diferencia es `guard_evidence_validation`, eliminada en 0023 | **Precisión añadida** |
| 297 triggers | 295 en `public` + 1 en `auth.users`; 1 eliminado en 0023 | **Precisión añadida** |
| 291 políticas | 291 era el recuento **bruto de sentencias**; el estado final es 253 en `public` + 9 en `storage` | **Precisión añadida** |
| Planes: `organization_modules` es la autoridad | Confirmado: 1 sola política (SELECT); columnas y CHECK presentes | Ninguno — **reforzado** |
| TrazaDocs: 8 tablas, motor único | **8 confirmadas con RLS y políticas** | Ninguno |
| Evidencias: dos sistemas paralelos | **Confirmado en producción**: `evidences`/`evidence_links` y `textile_evidences`/`textile_evidence_links`, los cuatro con RLS | Ninguno — **reforzado** |
| `frameworks` / `requirements` existen | **Confirmadas con RLS** | Ninguno |
| `audit_log` con RLS y 1 política | **Confirmado** | Ninguno |
| Módulo `quality` = placeholder | **Confirmado indirectamente** (§5.6) | Ninguno |
| Hallazgo **F-1** (cast `::uuid` directo) | **CONFIRMADO en producción**, y ahora acotado con precisión: afecta a **exactamente 5 políticas** — `trazadocs_documents_select` y las 4 de `organization-assets` | **Acotado** |
| 0007–0014 `DESCONOCIDO` | **RESUELTO**: nunca existieron | **Cerrado** |
| DR-01 abierto | **RESUELTO** | **Cerrado** |

**Ninguna conclusión de Q0 resultó incorrecta.** Tres ganaron precisión y dos se cerraron. Las
diferencias de recuento provenían de mis patrones de extracción locales, no de discrepancias
reales entre repositorio y producción.

---

## 9. Estado final

### **Q0 VERIFIED WITH GAPS**

**Verificado:** el esquema desplegado corresponde exactamente al declarado por el repositorio y
las migraciones. DR-01 queda resuelto y cerrado. El fundamento técnico sobre el que Q0 basó su
mapeo para Quality es real y está confirmado en producción.

**Gaps que impiden un "Q0 VERIFIED" pleno:**

1. **DR-02 no resuelto para Production** — el CLI de Vercel no está instalado; la existencia de
   `ACTIVE_ORG_COOKIE_SECRET` en Production no es determinable desde aquí.
2. **Configuración de entorno Development rota** — apunta a un proyecto Supabase inexistente (§3).

Ninguno de los dos gaps afecta a las conclusiones de arquitectura de Q0 ni al diseño de Quality.
Ambos son operativos y deben resolverse antes de que Q1/Q2 empiecen a escribir código.

---

## 10. Decisiones requeridas

### Cerradas por Q0.1

| ID | Estado |
|---|---|
| **DR-01** | **CERRADA.** Esquema alineado, sin drift, 102/102 migraciones aplicadas, 0007–0014 nunca existieron. |

### Abiertas o nuevas

| ID | Decisión |
|---|---|
| **DR-02** | *(parcial)* Confirmar `ACTIVE_ORG_COOKIE_SECRET` en el entorno **Production** de Vercel. Requiere `vercel env ls production` o el panel. Decisión: ¿se instala el CLI de Vercel o lo verifica una persona? |
| **DR-13** | **NUEVA.** Corregir la configuración del entorno Development, que apunta al proyecto Supabase retirado `dtrxxqmdweykzncfmahc`. ¿Se repunta a `mvmpadeixomwkpxbnhky`, se crea un proyecto de desarrollo propio, o se trabaja solo contra Postgres local (`tests/db/run-local-pg.sh`)? Bloquea el desarrollo local de Q1/Q2. |
| **DR-14** | **NUEVA.** ¿Debe existir un entorno de staging separado de producción para el desarrollo de Quality? Hoy el repositorio está vinculado directamente a `trazaloop-production` y el CLI opera contra él por defecto, lo que hace que un `db push` accidental impacte producción. |
| **DR-03 … DR-12** | Sin cambios; siguen abiertas tal como las dejó Q0. |

---

## 11. Confirmación de no intervención

- **Cero** migraciones creadas o modificadas.
- **Cero** cambios en Supabase, Vercel, variables de entorno, Auth o Storage.
- **Cero** sentencias INSERT / UPDATE / DELETE / DDL ejecutadas por mí.
- **Cero** commits, **cero** push.
- **Ningún** hallazgo corregido, incluido F-1, confirmado ahora en producción.
- **Ningún** secreto impreso, descargado ni almacenado.
- **Ninguna** reparación automática de drift aceptada (no se ofreció ninguna).
- Datos de clientes: **no leídos**. Los volcados fueron de esquema, sin filas.
