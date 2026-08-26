# QUALITY-08 · Matriz de pruebas

## 1 · Las suites

| Suite | Qué comprueba | Resultado |
|---|---|---|
| `npm run test:quality08` | 112 comprobaciones puras y estáticas | **112 conformes, 0 fallos** |
| `npm run test:quality08-rls` | 60 contra base real, con sesiones reales y cliente anónimo | **60 conformes, 0 fallos** (Local **y** Staging) |
| `npm run test:all` | regresión completa de la plataforma | **TEST_ALL_EXIT_REAL = 0** |

`test:quality08` está registrada en `test:all`.

## 2 · Las puras (`tests/unit/quality-08-customer-voice.test.ts`)

| Bloque | Qué defiende |
|---|---|
| **A** · Cliente = papel | sin tabla de clientes · cliente y proveedor conviven · puente opcional con PCR · reutilizar antes que crear |
| **B** · Cliente ≠ contacto ≠ quien responde | contactos de la empresa · la voz no cuelga de un texto · responder no crea contacto · cliente sin contactos |
| **C** · Fuentes de voz | las cuatro · la espontánea no exige encuesta · contexto transaccional referenciado |
| **D** · Encuesta ≠ versión | preguntas en la versión · publicada inmutable · publicar no toca respuestas · vigencia obligatoria |
| **E** · Preguntas y escalas | siete tipos y sin lógica condicional · clave estable · escalas configurables · la base exige lo que cada tipo necesita |
| **F** · Campaña | separada de la encuesta · una versión sirve para varias · periodo y ventana · reabrir con motivo · solo versiones publicadas |
| **G** · **ANONIMATO** | 11 comprobaciones que buscan el camino que rompería la promesa |
| **H** · Puerta pública | token nunca en claro · sin `organization_id` · un solo motivo de rechazo · borrador y cerrada denegadas · consumo condicional · `anon` sin privilegios · fuera del shell |
| **I** · Respuestas | borrador se edita, enviada es final · valores tampoco · corregir es una fila nueva |
| **J** · «No aplica» | tres desenlaces · la base rechaza el valor · el cálculo excluye · se dice cuánto se miró |
| **K** · Métricas | sin metodología impuesta · **NPS solo con 0–10** · la fórmula correcta · sin NPS falso al cambiar la escala · linaje congelado |
| **L** · Comparabilidad | la clave cambia con el instrumento · la serie se parte · la vista marca el corte · pantalla y papel lo dicen |
| **M** · Cobertura | sin denominador no hay tasa · recuento ≠ tasa · cero respuestas ≠ cero satisfacción · población creíble |
| **N** · Queja ≠ NC | sin clasificación en la tabla · registrar no abre caso · el caso nace sin clasificar · referencias, no copias · seis tipos |
| **O** · Señales | el barrido no clasifica ni crea riesgos · idempotente · se cierra sola · rechaza otra empresa |
| **P** · Motores transversales | sin tablas propias · ensanche aditivo · destinos de la bandeja · fuentes nativas de OI · el cálculo no toca mediciones |
| **Q** · Seguridad | `search_path` en todas · ninguna definer se fía del parámetro · RLS en las 14 · vistas invoker · políticas bien nombradas · capacidades separadas |
| **R** · Ni CRM ni marketing | sin embudo ni valor de cuenta · sin envío masivo ni seguimiento de apertura · sin puntuar clientes |
| **S** · Ciclo de vida | encuesta, cliente y campaña con historia no se borran · una sola puerta pública · cierre final |
| **T** · Cierre anual | existe · exige veredicto de metodología · deja decisión formal |
| **U** · Papel | cada entidad con su clave · inventario sin repetidos · la queja no se llama NC · la versión no se reconstruye |
| **V** · UX y accesibilidad | cinco entradas · rutas protegidas · «empresa» · aviso de anonimato antes del botón · fieldset/legend/alert · sin logo desde el bucket privado |
| **W** · Migración | 0126 única del dominio · append-only |

## 3 · Las de base real (`tests/rls/quality-08-customer-voice.test.ts`)

Los catorce escenarios del encargo, con cuatro usuarios reales, dos empresas y
el **cliente anónimo** para todo lo público:

| Escenario | Bloque | Comprobaciones |
|---|---|---|
| 0 · el cliente es un papel | A | 3 |
| 1 · la encuesta se versiona (§76) | B | 5 |
| 2 · dos campañas del mismo instrumento (§77) | C | 4 |
| 3 · NPS (§78) | D | 4 |
| 4 y 5 · cero respuestas y «no aplica» (§79, §80) | E | 3 |
| 6 · **anonimato real** (§81) | F | 8 |
| 7, 8 y 14 · la puerta pública (§82, §83, §89) | G | 9 |
| 9 · queja ≠ NC (§84) | H | 5 |
| 10 y 11 · señales y tendencia (§85, §86) | I | 4 |
| 13 · ciclo de vida (§88) | J | 6 |
| — · cierre anual y permisos | K | 4 |
| 12 · lo de otra empresa no existe | L | 5 |

Todo corre con la **sesión real** de cada usuario; el cliente administrativo solo
crea cuentas y membresías.

## 4 · §103 · Contra Staging, de verdad

```
NEXT_PUBLIC_SUPABASE_URL=https://qchzkxbnbqeyuxinipln.supabase.co \
npx tsx tests/rls/quality-08-customer-voice.test.ts
  → 60 conformes, 0 fallos
```

Incluye el flujo público completo: enlace real emitido, resuelto, respondido y
reutilizado. Verificado en el remoto: 9 respuestas por enlace público, 9
invitaciones usadas, **0 respuestas anónimas con identidad**, **0 filas de
auditoría** de respuestas anónimas, 0 no conformidades y 0 riesgos.

Y la PÁGINA pública, contra la compilación de producción:

```
/survey/<token válido>    → 200 · empresa, aviso de anonimato, escala 0–10,
                                  «(obligatoria)», «No aplica en mi caso»
/survey/000…0 (inventado) → 200 · «Este enlace no está disponible»
                                  · 0 menciones de la empresa
```

## 5 · Los defectos que encontraron las pruebas

Siete. Los seis primeros se corrigieron **antes** de aplicar 0126 a Staging.

### 5.1 · `pgcrypto` vive en `extensions`, y la RPC pública fallaba entera

`gen_random_bytes` y `digest` sin calificar no resuelven con
`set search_path = public`. Ninguna prueba estática podía verlo: la migración
aplica sin error y la función **falla en ejecución**, así que emitir un enlace
devolvía «function does not exist» y la superficie pública no servía.

Es exactamente el defecto que la RPC del pasaporte textil tuvo en 0092 y que
0095 corrigió. **Corregido:** `extensions.gen_random_bytes(...)` y
`extensions.digest(...)`.

### 5.2 · Las métricas contaban las respuestas de TODAS las campañas

Las cuatro consultas del cálculo filtraban por PREGUNTA, no por campaña. Como
varias campañas comparten versión —y por tanto las mismas filas de pregunta—,
cada métrica sumaba las respuestas de todas ellas: un NPS de agosto incluía las
respuestas de marzo.

Habría inflado en silencio todas las métricas del producto. **Corregido:**
`and r.campaign_id = p_campaign_id` en las cuatro.

### 5.3 · Las vistas no tenían privilegio de lectura

`security_invoker` decide qué filas devuelve una vista; el privilegio decide si
se puede consultarla. Las tres vistas se crearon sin `grant select`, así que la
aplicación recibía «permission denied» aunque la RLS fuera perfecta.

**Corregido:** revocar y conceder `select` a `authenticated` sobre las tres.

### 5.4 · `work_decisions.decision_kind` es un catálogo cerrado

Cerrar el periodo insertaba una decisión con un tipo que la restricción no
admitía, y la RPC entera fallaba. **Corregido:** ensanche aditivo con
`'customer_voice_period_closed'`.

### 5.5 · Tres dictámenes de eliminación con el nombre equivocado

Al reescribir `quality_deletion_eligibility` para añadir dos entidades, tres
ramas quedaron apuntando a funciones que no existen
(`quality_document_deletion_verdict` en vez de
`trazadoc_document_deletion_verdict`, y las de caso y acción). **Corregido** con
los nombres reales, más `quality_knowledge_item_deletion_verdict`.

### 5.6 · Y dos comprobaciones heredadas que casi se pierden

La misma reescritura dejó fuera el `if auth.uid() is null` y —más grave— la
comprobación de QUALITY-06 que impide que quien no puede ver una ficha de
persona se entere de cuánta historia tiene.

**Lo detectó la regresión de `test:quality06-rls`, no una prueba de este
sprint.** Restauradas palabra por palabra, y ahora la suite pura de QUALITY-08
las defiende explícitamente.

### 5.7 · La nomenclatura de las claves de exportación

Dos claves terminaban en `.report`, que la gramática de la plataforma no admite
—`.detail`, `.list` o `.historical`—, y dos nombres de documento empezaban por
«Informe» donde la convención exige «Listado» o «Reporte». **Corregido** en las
cuatro.

## 6 · Y un hallazgo sobre la herramienta

PostgREST construye un `INSERT` con la **unión** de las claves de un lote, así
que una fila que no traiga una columna recibe `NULL` explícito y pierde su
`DEFAULT`. Con `allows_not_applicable boolean not null default false`, un lote
heterogéneo falla.

No es un defecto del producto —la capa de datos inserta filas homogéneas o de
una en una— pero se anota porque es la clase de trampa que muerde después. Se
descubrió preparando la verificación de la página pública.
