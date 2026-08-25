# QUALITY-04 · Validación en Staging

**Destino:** `qchzkxbnbqeyuxinipln` — `trazaloop-staging-qa`
**Rama:** `feature/quality-04-cases-actions`
**Fecha:** 2026-08-25
**Production:** **intacta** — ver §5

## 1. Migración

Staging estaba en **0120** y quedó en **0121**. Append-only, sin
`migration repair`, sin editar ninguna migración histórica.

```
$ npx supabase db push --project-ref qchzkxbnbqeyuxinipln --dry-run
 • 0121_work_cases_and_actions_engine.sql

$ npx supabase db push --project-ref qchzkxbnbqeyuxinipln
Applying migration 0121_work_cases_and_actions_engine.sql...

$ npx supabase migration list --project-ref qchzkxbnbqeyuxinipln
  local=0120  remote=0120
  local=0121  remote=0121
```

## 2. Suites contra Staging

```
· entorno: qchzkxbnbqeyuxinipln

test:quality04        EXIT=0  →  30 correctas, 0 fallidas
test:quality04-rls    EXIT=0  →  33 correctas, 0 fallidas
test:quality031a-rls  EXIT=0  →  11 correctas, 0 fallidas
test:quality031-rls   EXIT=0  →  30 correctas, 0 fallidas
test:quality03-rls    EXIT=0  →  52 correctas, 0 fallidas
test:quality02-rls    EXIT=0  →  58 correctas, 0 fallidas
test:quality012-rls   EXIT=0  →  30 ✔, 0 ✘
test:quality011-rls   EXIT=0  →  37 en verde, 0 en rojo
test:quality01-rls    EXIT=0  →  51 en verde, 0 en rojo
                                 ─────────────────────
                                 302 comprobaciones
```

Lo que esto demuestra en el entorno remoto y no solo en local:

- un indicador fuera de meta **no crea** ninguna no conformidad, ni siquiera
  después del barrido;
- una decisión formal **no se puede editar** desde el cliente;
- una verificación «no eficaz» **no se convierte** en «eficaz» con un UPDATE;
- un caso **no se cierra** con una eficacia pendiente;
- una empresa ajena no ve casos, ni decisiones, ni la vista de resumen.

## 3. Aceptación en navegador

Con una empresa **Quality-only** —PCR y Textiles deshabilitados—, un cargo con
titular, un proceso y un indicador con **82 frente a meta 95**:

| Paso | Resultado |
|---|---|
| Ficha del indicador | Bloque *«¿Esto hay que atenderlo?»* explicando que **una señal no es una no conformidad** |
| Clic en «Crear un caso a partir de esta señal» | Lleva al formulario con el aviso: *«Este caso nacerá de una señal… Que la señal exista no lo convierte en no conformidad»* |
| Listado antes de crear | **No conformidades · 0** |
| Crear el caso | `C-2026-001`, «Sin evaluar» + «Borrador» |
| Bloque «De dónde viene» | Enlace al indicador + **contexto congelado**: «Periodo 2026-01 · resultado 82 · meta 95 · no cumple» |
| Registrar hallazgo → Evaluar como **observación** | Clasificado, con fundamento |
| Paso 4 «Causa» | **No aparece**: una observación no exige análisis de causa (AC-07, AC-08) |
| Paso 6 «Cierre» | *«El ciclo está completo: el caso puede cerrarse»* |
| Cerrar con fundamento | Cerrado, con «Reabrir el caso» disponible |
| Historial | Dos decisiones: **Evaluado como observación** y **Caso cerrado**, con quién, cuándo y por qué |
| Ciclo de vida | *«Este caso ya no puede eliminarse… ya fue evaluado, tiene 1 hallazgo, tiene 2 decisiones registradas»* |
| Listado al final | **No conformidades · 0** · Todos · 1 |

El ciclo completo de una **no conformidad** —causa aprobada, corrección, acción
correctiva, eficacia negativa, segunda acción, eficacia positiva, cierre
condicionado y reapertura— está verificado exhaustivamente en la suite de base
real (`B1`–`B18`), en local y en Staging.

## 4. Preview

**Enlace canónico** — el alias de rama:

```
https://trazaloop-production-git-feature-9680d4-idendi-latam-s-projects.vercel.app
```

`target: preview`, estado **Ready**, confirmado por `githubCommitRef`. Responde
**302** tras el SSO de Vercel: la limitación **G-2** documentada desde
QUALITY-01.1, no desactivada porque es una opción de proyecto compartida con
Production.

No se creó ni se modificó ninguna variable de entorno.

## 5. Production

**Intacta.** Sin migración, sin despliegue, sin variables, sin datos, sin seeds,
sin activación.

Comprobación de solo lectura, por HTTP, sin CLI y sin conexión a la base:

```
work_cases          → PGRST205   no existe
work_actions        → PGRST205   no existe
work_decisions      → PGRST205   no existe
work_references     → PGRST205   no existe

trazadoc_documents  → HTTP 200   (control: una tabla que sí existe)
```

## 6. Repositorio desvinculado

```
$ npx supabase status
"linked_project": null
```

`supabase/.temp/linked-project.json` volvió a aparecer al consultar la API de
gestión —apuntando a Staging— y se retiró. Es la cuarta vez: conviene revisarlo
al cierre de cada sprint, porque el CLI lo reescribe solo.
