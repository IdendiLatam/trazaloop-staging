# QUALITY-03 · Validación en Staging

**Destino:** `qchzkxbnbqeyuxinipln` — `trazaloop-staging-qa`
**Rama:** `feature/quality-03-objectives-indicators`
**Fecha:** 2026-08-22
**Production:** **intacta** — ver §6

---

## 1. Destinos

| Proyecto | Ref | Papel en este sprint |
|---|---|---|
| `trazaloop-staging-qa` | `qchzkxbnbqeyuxinipln` | **Único destino de escritura** |
| `trazaloop-production` | `mvmpadeixomwkpxbnhky` | Fuera de alcance. No se tocó |

El único `--project-ref` de escritura que aparece en todo el sprint es
`qchzkxbnbqeyuxinipln`.

---

## 2. Migraciones

Staging estaba en **0116** y quedó en **0118**. Append-only, sin
`migration repair`, sin editar ninguna migración histórica.

```
$ npx supabase db push --project-ref qchzkxbnbqeyuxinipln --dry-run
Would push these migrations:
 • 0117_quality_objectives_indicators_and_measurements.sql

$ npx supabase db push --project-ref qchzkxbnbqeyuxinipln
Applying migration 0117_quality_objectives_indicators_and_measurements.sql...
{"upToDate":false,"dryRun":false,"migrations":["0117_…sql"],…}
```

Después del hallazgo de §3, y **sin tocar 0117**:

```
$ npx supabase db push --project-ref qchzkxbnbqeyuxinipln
Applying migration 0118_quality_measurement_engine_privilege_hardening.sql...
{"upToDate":false,"dryRun":false,"migrations":["0118_…sql"],…}
```

```
$ npx supabase migration list --project-ref qchzkxbnbqeyuxinipln
  local=0116  remote=0116
  local=0117  remote=0117
  local=0118  remote=0118
```

---

## 3. Lo que Staging encontró y local no podía encontrar

**Esta es la razón por la que el sprint se valida en remoto.** La primera
ejecución de la suite de base real contra Staging dio **50 ✔, 2 ✘**:

```
✘ G5. los eventos son INMUTABLES (AT-03): se reescribió un evento
✘ X2. no se puede alterar una evaluación calculada: se alteró una evaluación
```

Las mismas dos pruebas estaban en verde en local, y no por casualidad: los
privilegios por defecto de una tabla nueva son `Dxtm` en local y `arwdDxtm` en
un proyecto remoto de Supabase. 0117 §21 concedía `SELECT` y revocaba
`truncate, references, trigger`, pero **conceder SELECT no retira lo que el
entorno ya concedió**, así que en Staging `authenticated` conservaba `UPDATE` y
`DELETE` sobre las mediciones, las configuraciones, los cierres, las ejecuciones
y los eventos.

La RLS seguía bloqueando —esas tablas no tienen política de escritura—, pero
«cero filas afectadas» no es «denegado»: PostgREST devuelve 204 sin error. Por
eso solo lo delataron las pruebas de `UPDATE`; las de `INSERT` pasan en los dos
entornos, porque violar una política de inserción **sí** levanta error.

**0118** revoca el DML sobre las cinco tablas de solo lectura del motor y
únicamente `UPDATE` sobre la evidencia. La prueba **M15** fija el invariante en
local para que la próxima tabla de solo lectura no repita el olvido.

Tras aplicar 0118, la suite completa: **52 ✔, 0 ✘**.

---

## 4. Comportamiento verificado contra Staging

### 4.1 · Base real, con la sesión de cada usuario

```
· entorno: qchzkxbnbqeyuxinipln

test:quality03-rls   EXIT=0  →  52 correctas, 0 fallidas
test:quality02-rls   EXIT=0  →  58 correctas, 0 fallidas
test:quality012-rls  EXIT=0  →  30 ✔, 0 ✘
test:quality011-rls  EXIT=0  →  37 en verde, 0 en rojo
test:quality01-rls   EXIT=0  →  51 en verde, 0 en rojo
                                ───────────────────────
                                228 comprobaciones
```

Todas bajo RLS, con sesiones reales. `service_role` se usa solo para crear
cuentas y ajustar el plan comercial.

Los nueve casos críticos que el encargo exige comprobar **en Staging**:

| Caso | Prueba | Resultado |
|---|---|---|
| **A** · enero ≥90 con 92 CUMPLE; cambiar a ≥95 no altera enero | `D1` | ✔ |
| **A** · el mismo 92 en un periodo nuevo se mide contra ≥95 | `D2` | ✔ |
| **B** · 90→95→97 favorable donde más es mejor | `B1`, `C1` | ✔ |
| **B** · 10→7→4 favorable donde menos es mejor | `B2`, `C2` | ✔ |
| **C** · medición 0 es dato real; ausencia es sin dato | `C1`, `C2` | ✔ |
| **D** · un automático se calcula desde datos Quality reales | `E2`, `E7` | ✔ |
| **D** · el navegador no puede introducir el valor automático | `E4` | ✔ |
| **E** · fuera de meta genera señal, **nunca** una NC | `G4` | ✔ |
| **F** · tras cerrar no se reescribe meta, configuración ni medición | `H1`,`H2`,`H3` | ✔ |

### 4.2 · Recorrido humano por HTTP contra Staging

```
test:quality03-ui    EXIT=0  →  17 correctas, 0 fallidas
test:quality02-ui    EXIT=0  →  26 correctas, 0 fallidas
test:quality012-ui   EXIT=0  →  16 en verde, 0 en rojo
test:quality011-ui   EXIT=0  →  16 en verde, 0 en rojo
test:quality01-ui    EXIT=0  →  15 en verde, 0 en rojo
                                ───────────────────────
                                90 pasos
```

**`NEXT_PUBLIC_*` se inlinea en el build.** Un build hecho con el entorno local
apunta a Supabase local por mucho que se cambien las variables al arrancar. El
recorrido se corrió sobre un build recompilado con el entorno de Staging, y el
`.env.local` original se restauró después, verificado idéntico.

### 4.3 · Quality-only

La empresa del recorrido tiene **PCR sin acceso y Textiles sin acceso**. El paso
17 lo comprueba explícitamente. Nada de Objetivos e Indicadores se apoya en
ningún otro módulo.

---

## 5. Preview

**Enlace canónico** — el alias de rama, que siempre apunta al último despliegue
de `feature/quality-03-objectives-indicators`:

```
https://trazaloop-production-git-feature-9038ed-idendi-latam-s-projects.vercel.app
```

Estado **Ready**, `target: preview`. Confirmado por rama:

```
$ npx vercel ls --meta githubCommitRef=feature/quality-03-objectives-indicators
  https://trazaloop-production-j640nxcqh-idendi-latam-s-projects.vercel.app  ● Ready  Preview
```

La URL inmutable (`…-j640nxcqh-…`) cambia con cada commit —incluidos los que
solo tocan documentación—, así que el alias es el enlace que hay que usar.

Sigue tras el SSO de Vercel: responde **302** a una petición anónima. Es la
limitación **G-2** documentada desde QUALITY-01.1 y no se desactivó, porque es
una opción de proyecto compartida con Production.

No se creó ni se modificó ninguna variable de entorno en este sprint.

---

## 6. Production

**Intacta.**

| | |
|---|---|
| Migraciones aplicadas | ninguna |
| Variables de entorno | sin tocar |
| Despliegues | ninguno (`target: preview` en el único despliegue del sprint) |
| Datos | sin escribir |
| Seeds / cambios de esquema | ninguno |

### 6.1 · Comprobación de solo lectura

Por HTTP, sin CLI, sin conexión a la base y sin inicializar ningún rol:

```
quality_objectives            → PGRST205   no existe
quality_indicators            → PGRST205   no existe
quality_indicator_configs     → PGRST205   no existe
quality_measurements          → PGRST205   no existe
quality_period_closures       → PGRST205   no existe
quality_calculation_runs      → PGRST205   no existe
quality_measurement_evidence  → PGRST205   no existe
work_events                   → PGRST205   no existe

trazadoc_documents            → HTTP 200   (control: una tabla que sí existe)
work_tasks                    → PGRST205   (0116 tampoco está allí)
```

El control importa: sin él, ocho respuestas de error no probarían nada —podrían
venir de una clave mal formada o de un proyecto caído—. Con él queda claro que
la API responde bien y que lo que falta es exactamente 0117 y 0118.

`work_tasks` ausente confirma además que Production sigue **sin 0116**, como
quedó tras QUALITY-02.

---

## 7. Repositorio desvinculado

```
$ npx supabase db push --dry-run
{"code":"LegacyProjectNotLinkedError","message":"Cannot find project ref…"}

$ npx supabase status
"linked_project": null
```

Un `db push` escrito por costumbre falla por falta de destino y obliga a un
`--project-ref` explícito.

> **Hallazgo.** `supabase/.temp/linked-project.json` había vuelto a aparecer y
> apuntaba a **`mvmpadeixomwkpxbnhky` — Production**. Es un resto que el CLI
> reescribe al consultar la API de gestión, y es exactamente la trampa que la
> guardrail existe para evitar. Se retiró, con copia fuera del repositorio.
> Conviene revisarlo al cierre de cada sprint.

---

## 8. Cómo repetirlo

```bash
# 1 · Verificar el destino ANTES de escribir
npx supabase projects list

# 2 · Qué se aplicaría (no escribe nada)
npx supabase db push --project-ref qchzkxbnbqeyuxinipln --dry-run

# 3 · Aplicar
npx supabase db push --project-ref qchzkxbnbqeyuxinipln

# 4 · Suites con base real (las credenciales NUNCA en el repositorio)
export NEXT_PUBLIC_SUPABASE_URL=https://qchzkxbnbqeyuxinipln.supabase.co
export NEXT_PUBLIC_SUPABASE_ANON_KEY=…
export SUPABASE_SERVICE_ROLE_KEY=…
export SUPABASE_DB_URL=""
npm run test:quality03-rls          # leer el EXIT CODE, no el texto

# 5 · Recorrido HTTP: recompilar con ESE entorno antes de correrlo
cp .env.local  /ruta/fuera/del/repo/env.local.ORIGINAL.bak
#   … componer .env.local con el destino de Staging …
npm run build && npm run test:quality03-ui
cp /ruta/fuera/del/repo/env.local.ORIGINAL.bak  .env.local   # restaurar

# 6 · Desvincular y comprobar que no quedó marcador
npx supabase unlink
cat supabase/.temp/linked-project.json 2>/dev/null || echo "sin marcador"
```
