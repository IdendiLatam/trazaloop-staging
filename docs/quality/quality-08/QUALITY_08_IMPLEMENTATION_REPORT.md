# QUALITY-08 · Informe de implantación

**Sprint:** voz del cliente, satisfacción, encuestas, retroalimentación y quejas
**Rama:** `feature/quality-08-customer-voice`
**Línea base:** `baseline/quality-07-post-acceptance` = `d843254`
**Migración:** `0126_quality_customer_voice.sql` — Local ✔ · Staging ✔ · Production ✘ (intencional)

---

## 1 · Qué se construyó

El dominio transversal de Voz del Cliente, conservando las seis separaciones que
lo hacen útil:

> **CLIENTE ≠ CONTACTO ≠ QUIEN RESPONDE**
> **ENCUESTA ≠ VERSIÓN ≠ CAMPAÑA ≠ RESPUESTA**
> **RETROALIMENTACIÓN ≠ QUEJA**
> **QUEJA ≠ NO CONFORMIDAD**
> **RESULTADO DE SATISFACCIÓN ≠ DECISIÓN FORMAL**
> **SEÑAL ≠ CASO ≠ NC**

| Capa | Qué hay |
|---|---|
| Esquema | 14 tablas · 3 vistas · 21 funciones · 25 políticas RLS · 46 disparadores |
| Dominio | `lib/domain/quality-customer-voice.ts` — puro |
| Datos | `lib/db/quality-customer-voice.ts` + `quality-survey-public.ts` (frontera anónima) |
| Acciones | 29 en el dominio + 1 pública sin sesión |
| Pantallas | 9 componentes · 7 rutas internas · 1 ruta **pública** |
| Papel | 15 exportaciones nuevas |
| Pruebas | 112 puras + 60 contra base real |

## 2 · Las cuatro decisiones que definieron el sprint

**El cliente es un PAPEL de la identidad externa (VC-03).** QUALITY-07 ya había
creado `quality_external_parties` y su catálogo de papeles ya admitía
`'customer'`. Crear una tabla de clientes habría duplicado ACME dentro de la
misma base. La misma empresa puede ser cliente y proveedor a la vez, con una
identidad y dos relaciones.

**El anonimato es estructural, no visual.** Cuando una campaña promete
anonimato, la base se queda sin ninguna columna que permita reconstruir
«respuesta → persona»: la invitación sabe a quién se invitó y que el enlace se
usó; la respuesta no sabe de qué invitación vino, no tiene autor y no lleva
auditoría de fila. La única puerta de escritura es la RPC pública, y la RLS no
concede ni un `insert` a la sesión.

**La queja es un hecho; la no conformidad es una decisión.** Registrar una queja
deja el recuento de no conformidades exactamente igual, y abrir el caso tampoco
lo mueve: el caso nace con `classification = 'pending'`, que es el valor por
defecto que QUALITY-04 ya había definido.

**Trazaloop no impone metodología, pero no falsifica ninguna.** La empresa
define qué mide y cómo. Lo único que el sistema se niega a hacer es llamar NPS a
algo que no lo es: la base rechaza declararlo sin escala 0–10, y si una versión
posterior cambia la escala, no se calcula un NPS falso — se corta la serie.

## 3 · Lo que este módulo NO es

- **No es un CRM.** Sin embudo, sin oportunidad comercial, sin valor de cuenta.
- **No es marketing.** Sin envío masivo, sin tasa de apertura, sin seguimiento.
- **No duplica clientes.** Ni entre módulos, ni entre papeles.
- **No convierte una queja en no conformidad**, ni abre un caso por su cuenta.
- **No crea riesgos ni acciones** porque una métrica baje.
- **No inventa porcentajes** sin denominador, ni ceros donde no hubo respuestas,
  ni ceros donde alguien dijo «no aplica».
- **No dibuja tendencias continuas** cuando cambió el instrumento.
- **No puntúa empleados** con la retroalimentación de clientes (VC-24).
- **No crea motores propios.** Todo pasa por los transversales.

## 4 · Los defectos que encontraron las pruebas

Siete. Los cuatro de fondo:

1. **`pgcrypto` vive en `extensions`** y la RPC pública fallaba entera en
   ejecución. Ninguna prueba estática podía verlo. Es el mismo defecto que 0092
   tuvo y 0095 corrigió.
2. **Las métricas contaban las respuestas de TODAS las campañas** que
   compartieran versión. Habría inflado en silencio todos los resultados del
   producto.
3. **Las vistas no tenían privilegio de lectura**: `security_invoker` decide qué
   filas, el privilegio decide si se puede consultar.
4. **Dos comprobaciones heredadas casi se pierden** al reescribir el despachador
   de eliminación — incluida la de QUALITY-06 que impide enterarse de cuánta
   historia tiene una ficha de persona que no se puede ver. **Lo detectó la
   regresión, no una prueba de este sprint.**

Los tres restantes y un hallazgo sobre PostgREST están en
`QUALITY_08_TEST_MATRIX.md` §5.

## 5 · Informe por secciones

### A · Rama

Rama `feature/quality-08-customer-voice`, creada desde el baseline oficial y con árbol limpio

> `git branch --show-current`

### B · HEAD

HEAD real de QUALITY-07 identificado desde Git, no desde el enunciado: `d843254`

> `git log --graph --decorate`

### C · Commits

Dos commits: implantación y entregables. Sin merge, cherry-pick ni rebase

> `git log --oneline`

### D · Baseline

`baseline/quality-07-post-acceptance` = `d843254`, verificado y empujado

> `git rev-parse` contra el HEAD real

### E · Migraciones

`0126_quality_customer_voice.sql` — única del dominio, append-only, sin repair

> pruebas W1, W2

### F · Discovery

Se auditaron clientes, contactos, encuestas, tokens públicos, feedback, casos, indicadores y rutas públicas ANTES de escribir esquema

> `QUALITY_08_DATA_MODEL.md` · `QUALITY_08_CUSTOMER_IDENTITY.md` §5

### G · Identidad del cliente

VC-03 · el cliente es un PAPEL de `quality_external_parties`; no se creó ninguna tabla de clientes

> prueba A1 · RLS A1

### H · Contactos y respondientes

Cliente ≠ contacto ≠ quien responde; responder no crea contacto y un cliente puede no tener ninguno

> pruebas B1–B4

### I · Fuentes de voz

Relacional, periódica, transaccional y espontánea; la espontánea no exige encuesta

> pruebas C1, C2

### J · Encuestas

Identidad estable, separada de su estructura; siete tipos de pregunta y ninguna lógica condicional

> pruebas D1, E1

### K · Versiones

Publicada es inmutable; publicar la v2 no toca ninguna respuesta de la v1

> pruebas D2, D3 · RLS B2, B3

### L · Preguntas y escalas

`stable_key` atraviesa versiones; las escalas son configurables sin ningún 1–5 cableado

> pruebas E2, E3

### M · Campañas

Definición ≠ aplicación; una versión sirve para varias campañas y reabrir exige motivo

> pruebas F1–F6 · RLS C1–C4

### N · Distribución pública

Ruta `/survey/[token]` fuera del shell, dos RPC, el token resuelve el contexto y el hash nunca sale

> pruebas H1–H8 · RLS G1–G9

### O · Anonimato

Estructural: sin columna, sin join, sin autor, sin auditoría, sin PDF individual y sin atribución en la ficha

> bloque G (11) · RLS bloque F (8)

### P · Respuestas

Borrador editable, enviada final; corregir es una respuesta nueva que sustituye

> pruebas I1–I4 · RLS J5

### Q · Métricas

La empresa define qué mide; NPS solo con escala 0–10 y con la fórmula correcta

> pruebas K1–K6 · RLS D1–D4

### R · Tendencia y comparabilidad

La clave de comparabilidad corta la serie donde cambia el instrumento

> pruebas L1–L4 · RLS I4

### S · Retroalimentación

Seis tipos; la voz no se reduce a positivo/negativo y no exige encuesta

> pruebas N5, C2

### T · Quejas

Una queja NO es una no conformidad y no abre ningún caso por su cuenta

> pruebas N1, N2 · RLS H1

### U · Casos y acciones

Escalar es una decisión, el caso nace sin clasificar y las acciones son las del motor

> pruebas N3, N4, P1 · RLS H2–H5

### V · Señales

Una satisfacción baja produce señal y cero no conformidades, riesgos y acciones

> pruebas O1–O4 · RLS I1–I3

### W · Indicadores

Cuatro fuentes nativas en el catálogo de QUALITY-03; sin motor duplicado y sin tocar mediciones cerradas

> pruebas P4, P5

### X · Verdad histórica

Qué preguntaba la encuesta en una fecha, con qué método se calculó y qué se decidió al cerrar

> `QUALITY_08_HISTORICAL_TRUTH.md` · RLS B5

### Y · Ciclo de vida

Encuesta, cliente y campaña con historia no se eliminan; una sola puerta pública de dictamen

> pruebas S1–S5 · RLS J1–J6

### Z · Privacidad

Tres capacidades separadas; el consultor no cierra el periodo y los comentarios no reidentifican

> prueba Q7 · RLS K1

### AA · RLS

Deny-by-default en las 14 tablas, vistas con `security_invoker` y sin escritura de respuestas

> pruebas Q4, Q5, G5

### AB · Ataques

Cross-tenant en 14 tablas, 3 vistas, 4 RPC y 5 escrituras: todo denegado

> RLS bloque L (5)

### AC · Seguridad pública

Token inventado, caducado, revocado, replay, campaña en borrador y cerrada: todo denegado y con el mismo mensaje

> RLS G3–G7

### AD · UX

Cinco entradas de menú, siete rutas internas protegidas, «empresa» en vez de «organización» y formulario público accesible

> pruebas V1–V6

### AE · Exportaciones

15 claves por el registro cerrado; inventario a 159 entidades y 138 claves, Q08_EXPORT_PENDING = 0

> prueba U1 · `test:export01` I1, I3

### AF · PDF

Encabezado corporativo en todas; el de una respuesta anónima NO se genera y la queja no se llama no conformidad

> pruebas U3, U4, G9

### AG · VC-01…35

Matriz completa: 24 IMPLEMENTED, 7 PARTIAL declarados y 3 DEFERRED por depender de IA

> `QUALITY_08_VC_MATRIX.md`

### AH · Pruebas

`test:quality08` 112/112 · `test:quality08-rls` 60/60 en Local y en Staging

> logs de las suites

### AI · Regresiones

`test:all` EXIT 0 · las siete suites RLS anteriores en verde · `build` EXIT 0

> logs

### AJ · Staging

Cabecera 0126, paridad sin desalineadas, esquema verificado y datos efímeros retirados lógicamente

> `QUALITY_08_STAGING_VALIDATION.md` §3–§6

### AK · Preview

READY, branch-scoped a Staging, SSO activo y cero referencias a Production

> `QUALITY_08_STAGING_VALIDATION.md` §8

### AL · Production

Cabecera 0111, variables de 32 días, sin migración, datos, usuarios, despliegue ni alias

> `QUALITY_08_STAGING_VALIDATION.md` §7

### AM · Brechas

Siete PARTIAL y tres DEFERRED, todos declarados con lo que falta y por qué

> `QUALITY_08_VC_MATRIX.md`

### AN · Checklist humano

Veinticuatro pasos, cada uno con qué mirar

> `QUALITY_08_HUMAN_CHECKLIST.md`

---

## 6 · Los 127 criterios de cierre


**Línea base y rama**

| # | Criterio | Veredicto |
|---|---|---|
| 1 | baseline Q07 correcto: `baseline/quality-07-post-acceptance` = `d843254`, el HEAD real y limpio | **PASS** |
| 2 | rama `feature/quality-08-customer-voice` creada desde ese baseline | **PASS** |
| 3 | discovery completo ANTES del esquema: clientes, contactos, encuestas, tokens, feedback, casos, indicadores y rutas públicas | **PASS** |

**Identidad del cliente**

| # | Criterio | Veredicto |
|---|---|---|
| 4 | identidad externa REUTILIZADA: el cliente es un papel, no una tabla nueva | **PASS** |
| 5 | CLIENTE ≠ CONTACTO: los contactos son de la empresa y viven en la identidad externa | **PASS** |
| 6 | CONTACTO ≠ QUIEN RESPONDE: cinco clases de respondiente y ninguna obliga a tener ficha | **PASS** |
| 7 | un cliente puede existir sin ningún contacto | **PASS** |

**Fuentes de voz**

| # | Criterio | Veredicto |
|---|---|---|
| 8 | retroalimentación espontánea sin encuesta de por medio | **PASS** |
| 9 | voz relacional | **PASS** |
| 10 | voz periódica | **PASS** |
| 11 | voz transaccional, con contexto referenciado solo si existe de verdad | **PASS** |

**Encuesta y versión**

| # | Criterio | Veredicto |
|---|---|---|
| 12 | ENCUESTA ≠ VERSIÓN: identidad estable separada de estructura congelada | **PASS** |
| 13 | una versión publicada es inmutable, impuesto por disparador | **PASS** |
| 14 | la versión congela preguntas, orden, tipo, obligatoriedad, opciones y escalas | **PASS** |
| 15 | preguntas estructuradas: siete tipos y ninguna lógica condicional | **PASS** |
| 16 | escalas configurables, sin ningún 1–5 cableado | **PASS** |

**Campaña**

| # | Criterio | Veredicto |
|---|---|---|
| 17 | la campaña es un objeto separado de la definición | **PASS** |
| 18 | la campaña conoce su periodo, su ventana, su población y su versión | **PASS** |
| 19 | semántica de borrador de respuesta: se edita mientras no se envía | **PASS** |
| 20 | una respuesta enviada es inmutable | **PASS** |

**Anonimato**

| # | Criterio | Veredicto |
|---|---|---|
| 21 | modo anónimo REAL: sin columna, sin autor y sin auditoría | **PASS** |
| 22 | modo identificado real: la respuesta conserva cliente y contacto | **PASS** |
| 23 | fuga de identidad en base de datos = 0, comprobada por columna, join, auditoría y ficha | **PASS** |
| 24 | el token nunca se guarda en claro: solo su sha256 y un prefijo | **PASS** |
| 25 | la caducidad la decide el reloj del SERVIDOR | **PASS** |
| 26 | el replay se deniega con un consumo condicional, sin carrera | **PASS** |
| 27 | la ruta pública falla cerrada ante todo, y siempre con el mismo mensaje | **PASS** |
| 28 | la ruta pública no acepta `organization_id`: el token resuelve el contexto | **PASS** |

**Queja y caso**

| # | Criterio | Veredicto |
|---|---|---|
| 29 | QUEJA ≠ NO CONFORMIDAD: la tabla no tiene ninguna columna de clasificación | **PASS** |
| 30 | QUEJA ≠ CASO AUTOMÁTICO: registrar no abre nada | **PASS** |
| 31 | «Crear caso» es una decisión explícita y el caso nace sin clasificar | **PASS** |
| 32 | se reutilizan las referencias de QUALITY-04; no se copia información | **PASS** |
| 33 | se reutiliza el motor de acciones | **PASS** |
| 34 | no existe ningún motor de acciones duplicado | **PASS** |

**Satisfacción y señales**

| # | Criterio | Veredicto |
|---|---|---|
| 35 | una satisfacción baja NO crea una no conformidad | **PASS** |
| 36 | una satisfacción baja NO crea un riesgo | **PASS** |
| 37 | modelo de señales, con dedupe y cierre automático al atenderlas | **PASS** |
| 38 | tendencia por serie, no por línea continua | **PASS** |
| 39 | los cortes de comparabilidad se detectan y se dicen | **PASS** |
| 40 | cero respuestas ≠ cero satisfacción | **PASS** |
| 41 | «no aplica» ≠ cero | **PASS** |
| 42 | los datos ausentes se distinguen de los datos malos | **PASS** |
| 43 | el NPS es correcto: bandas 9–10 / 7–8 / 0–6 y %promotores − %detractores | **PASS** |
| 44 | la tasa de respuesta solo existe con denominador verdadero, y se dice cuál | **PASS** |

**Cliente 360**

| # | Criterio | Veredicto |
|---|---|---|
| 45 | ficha del cliente con su voz, sus quejas y sus casos | **PASS** |
| 46 | lo anónimo NO se atribuye en la ficha del cliente | **PASS** |
| 47 | los grupos diminutos no se desglosan: umbral de reidentificación | **PASS** |
| 48 | los comentarios se tratan con permiso y sin usarse para reidentificar | **PASS** |

**Integraciones internas**

| # | Criterio | Veredicto |
|---|---|---|
| 49 | integración con indicadores mediante el catálogo de fuentes nativas | **PASS** |
| 50 | no se duplicó el motor de indicadores | **PASS** |
| 51 | los resultados pueden relacionarse con objetivos, sin crearlos | **PASS** |
| 52 | un riesgo solo se crea por decisión explícita | **PASS** |
| 53 | la responsabilidad estructural es del CARGO (MDR-33) | **PASS** |
| 54 | el actor histórico es la persona o el usuario | **PASS** |
| 55 | se reutilizan las alertas del motor transversal | **PASS** |
| 56 | se reutilizan las tareas del motor transversal | **PASS** |
| 57 | el barrido es idempotente: dos pasadas no duplican nada | **PASS** |

**Ciclo de vida**

| # | Criterio | Veredicto |
|---|---|---|
| 58 | encuesta: con respuestas no se elimina; se retira | **PASS** |
| 59 | versión publicada: no se elimina ni se reescribe | **PASS** |
| 60 | respuesta enviada: no se elimina ni se edita | **PASS** |
| 61 | queja con decisión: se cierra, no se borra | **PASS** |
| 62 | corregir una respuesta es append-only, nunca sobrescritura | **PASS** |

**Privacidad y seguridad**

| # | Criterio | Veredicto |
|---|---|---|
| 63 | el diseño de encuestas está separado de la lectura de resultados | **PASS** |
| 64 | las respuestas individuales tienen su propia protección | **PASS** |
| 65 | las quejas tienen su propia protección | **PASS** |
| 66 | aislamiento entre empresas en las 14 tablas | **PASS** |
| 67 | PostgREST directo denegado: sin política de escritura sobre respuestas | **PASS** |
| 68 | toda función SECURITY DEFINER con search_path y pertenencia comprobada | **PASS** |
| 69 | las vistas no filtran identidad anónima | **PASS** |
| 70 | manipulación del token público denegada | **PASS** |
| 71 | campaña en borrador denegada desde fuera | **PASS** |
| 72 | campaña cerrada denegada desde fuera | **PASS** |

**Interfaz**

| # | Criterio | Veredicto |
|---|---|---|
| 73 | el formulario público es accesible: fieldset, legend, alert y sin depender del color | **PASS** |
| 74 | el formulario público es usable en móvil | **PASS** |

**Papel**

| # | Criterio | Veredicto |
|---|---|---|
| 75 | PDF de encuesta | **PASS** |
| 76 | PDF de versión de encuesta, con su estructura exacta | **PASS** |
| 77 | PDF de campaña | **PASS** |
| 78 | PDF de informe de campaña, con cobertura y comparabilidad | **PASS** |
| 79 | PDF de respuesta identificada | **PASS** |
| 80 | el PDF de una respuesta anónima NO se genera | **PASS** |
| 81 | PDF de retroalimentación | **PASS** |
| 82 | PDF de queja, que no se llama no conformidad | **PASS** |
| 83 | reporte de satisfacción y reporte de tendencia | **PASS** |
| 84 | los PDF históricos dicen la verdad de su fecha | **PASS** |
| 85 | encabezado corporativo en todas las páginas | **PASS** |
| 86 | regresión del logo canónico de EXPORT-01.3 | **PASS** |
| 87 | Q08_EXPORT_PENDING = 0 | **PASS** |

**Escenarios**

| # | Criterio | Veredicto |
|---|---|---|
| 88 | escenario 1 · versionado de encuesta | **PASS** |
| 89 | escenario 2 · dos campañas del mismo instrumento | **PASS** |
| 90 | escenario 3 · NPS de 10, 9, 8 y 6 = 25 | **PASS** |
| 91 | escenario 4 · campaña sin respuestas | **PASS** |
| 92 | escenario 5 · «no aplica» | **PASS** |
| 93 | escenario 6 · campaña anónima | **PASS** |
| 94 | escenario 7 · campaña identificada | **PASS** |
| 95 | escenario 8 · replay del enlace | **PASS** |
| 96 | escenario 9 · queja sin mover el recuento de no conformidades | **PASS** |
| 97 | escenario 10 · satisfacción baja | **PASS** |
| 98 | escenario 11 · rotura de tendencia | **PASS** |
| 99 | escenario 12 · cliente 360 sin atribuir lo anónimo | **PASS** |
| 100 | escenario 13 · ciclo de vida | **PASS** |
| 101 | escenario 14 · seguridad de la ruta pública | **PASS** |

**Pruebas y regresiones**

| # | Criterio | Veredicto |
|---|---|---|
| 102 | `test:quality08` en verde: 112 conformes | **PASS** |
| 103 | `test:quality08-rls` en verde en Local: 60 conformes | **PASS** |
| 104 | suite de anonimato en verde: 11 estáticas + 8 contra base real | **PASS** |
| 105 | regresiones de Quality 01…05 | **PASS** |
| 106 | regresión de QUALITY-07 | **PASS** |
| 107 | regresiones de QUALITY-06 y 06.1 | **PASS** |
| 108 | regresiones de EXPORT-01…01.3 | **PASS** |
| 109 | regresión de PCR | **PASS** |
| 110 | regresión de Textiles | **PASS** |
| 111 | regresión de TrazaDocs | **PASS** |
| 112 | regresiones de autenticación y equipo | **PASS** |
| 113 | invariante de las cuentas QA permanentes | **PASS** |
| 114 | `npm run test:all` con código de salida real 0 | **PASS** |

**Entornos**

| # | Criterio | Veredicto |
|---|---|---|
| 115 | migración append-only | **PASS** |
| 116 | paridad de migraciones en Local | **PASS** |
| 117 | paridad de migraciones en Staging | **PASS** |
| 118 | escenario real ejecutado contra Staging | **PASS** |
| 119 | escenario público ejecutado contra Staging, con enlace y envío reales | **PASS** |
| 120 | Preview apunta a Staging | **PASS** |
| 121 | Preview en estado READY | **PASS** |
| 122 | Production permanece en 0111 | **PASS** |
| 123 | Production intacta: sin migración, datos, usuarios, semillas, entorno, despliegue ni alias | **PASS** |
| 124 | repositorio remote-unlinked | **PASS** |
| 125 | árbol de trabajo limpio | **PASS** |
| 126 | push normal, sin force ni rebase destructivo | **PASS** |
| 127 | matriz VC-01…VC-35 completa, con evidencia y con las brechas declaradas | **PASS** |
---

## 7 · Recuento

| | |
|---|---|
| Criterios evaluados | **127** |
| **PASS** | **127** |
| GAP | **0** |
| FAIL | **0** |

**VC-01…VC-35:** 24 IMPLEMENTED · 7 PARTIAL declarados · 3 DEFERRED por
depender de IA, excluida por §47. Ninguno es un olvido: los diez están escritos
con lo que falta y por qué en `QUALITY_08_VC_MATRIX.md`.

## 8 · Veredicto

```
QUALITY-08 CUSTOMER VOICE READY FOR USER TESTING
```

**127 PASS · 0 GAP · 0 FAIL**

QUALITY-09 no se ha iniciado.
