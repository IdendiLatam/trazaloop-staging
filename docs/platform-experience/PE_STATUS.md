# Experiencia de plataforma · dónde está cada cosa

Una sola página para no tener que abrir los ciento veintitrés documentos de
`docs/platform-experience/`.

*Actualizado el 1 de septiembre de 2026, al cierre de PE-04B2.*

---

## PE-01 · La entrada

| Tramo | Qué hizo | Estado |
|---|---|---|
| PE-01A | Descubrimiento y arquitectura de la entrada | **cerrado** |
| PE-01B | Implementación · portada, `/modules`, estados por módulo | **cerrado** |

---

## PE-02 · Ayuda y autoservicio

| Tramo | Qué hizo | Migración | Estado |
|---|---|---|---|
| PE-02A | Descubrimiento, arquitectura y auditoría de afirmaciones | — | **cerrado** |
| PE-02B1 | Los cimientos de la FAQ | 0155 | **cerrado** |
| PE-02B2 | La consola de contenido y el endurecimiento legal | 0156 | **cerrado** |
| PE-02B3 | La FAQ que ve el cliente · 24 respuestas | 0157 | **cerrado** |
| PE-02B4 | La ayuda contextual · 11 ayudas | 0158 | **cerrado** |
| PE-02B5A | Los borradores de seguridad, privacidad e IA | — | **cerrado** |
| PE-02B6 | Consolidación y preparación de la revisión | — | **cerrado** |
| PE-02B6.1 | El paquete editorial, para revisar sin consola | — | **cerrado** |
| PE-02B6.2 | Correcciones editoriales y pintado del texto legal | — | **cerrado** |
| PE-02B5B | **Publicación en Staging** | — | **cerrado** · 2026-08-31 |

---

## PE-03 · Tutoriales y bienvenida audiovisual

| Tramo | Qué hizo | Migración | Estado |
|---|---|---|---|
| PE-03A | Descubrimiento, arquitectura de medios y congelación de UX | — | **cerrado** · pendiente de revisión humana |
| PE-03B1 | Datos, cubo y RLS | **0159** | **cerrado** · 2026-08-31 |
| PE-03B2 | La consola de tutoriales | — | **cerrado** · 2026-08-31 |
| — | Incidente de la sonda de QA en Staging: [informe](PE_03_QA_PROBE_INCIDENT.md) | — | **corregido** · 2026-08-31 |
| PE-03B3 | El botón y el reproductor · **el tope de tamaño, revocado** | **0160** | **cerrado** · 2026-08-31 · pendiente de prueba humana |
| PE-03B4 | Bienvenida, preferencia por persona · **cobertura completa y acceso de plataforma** | **0161** | **cerrado** · 2026-08-31 · pendiente de prueba humana |
| PE-03B5 | Cierre: recuento, residuos, endurecimiento y aceptación integrada | — | **cerrado** · 2026-09-01 |

Los siete de PE-03B5:
[cobertura final](PE_03B5_FINAL_COVERAGE.md) ·
[residuos de QA](PE_03B5_QA_RESIDUE_AUDIT.md) ·
[endurecimiento](PE_03B5_HARDENING.md) ·
[aceptación integrada](PE_03B5_INTEGRATED_ACCEPTANCE.md) ·
[plan editorial](PE_03B5_TUTORIAL_ROLLOUT_PLAN.md) ·
[guion de la bienvenida](PE_03B5_WELCOME_VIDEO_BRIEF.md) ·
[corte de producción](PE_03_PRODUCTION_CUTOVER_CARRYOVERS.md).

Los siete de PE-03B4:
[bienvenida](PE_03B4_WELCOME_VIDEO.md) ·
[preferencias de persona](PE_03B4_USER_PREFERENCES.md) ·
[cobertura completa](PE_03B4_COMPLETE_TUTORIAL_COVERAGE.md) ·
[acceso del personal de plataforma](PE_03B4_PLATFORM_STAFF_ACCESS.md) ·
[retirada de qa-a](PE_03B4_SUPERADMIN_RETIREMENT.md) ·
[pruebas](PE_03B4_TEST_MATRIX.md) ·
[revisión humana](PE_03B4_HUMAN_VALIDATION.md).

Los siete de PE-03B3:
[el tutorial de pantalla](PE_03B3_PAGE_TUTORIAL_EXPERIENCE.md) ·
[medios sin tope](PE_03B3_LARGE_MEDIA_ARCHITECTURE.md) ·
[renovación](PE_03B3_PLAYBACK_RENEWAL.md) ·
[traspaso de superadministrador](PE_03B3_SUPERADMIN_HANDOVER.md) ·
[cobertura de claves](PE_03B3_PAGE_KEY_COVERAGE.md) ·
[pruebas](PE_03B3_TEST_MATRIX.md) ·
[revisión humana](PE_03B3_HUMAN_VALIDATION.md).

Los seis de PE-03B2:
[consola](PE_03B2_SUPERADMIN_TUTORIALS.md) ·
[subida](PE_03B2_UPLOAD_WORKFLOW.md) ·
[publicación e historia](PE_03B2_PUBLICATION_HISTORY.md) ·
[reponer](PE_03B2_RESTORE_WORKFLOW.md) ·
[pruebas](PE_03B2_TEST_MATRIX.md) ·
[revisión humana](PE_03B2_HUMAN_VALIDATION.md).

Los seis de PE-03B1:
[datos](PE_03B1_TUTORIAL_DATA_FOUNDATION.md) ·
[almacenamiento](PE_03B1_MEDIA_STORAGE.md) ·
[subida](PE_03B1_UPLOAD_SECURITY.md) ·
[versiones](PE_03B1_VERSION_HISTORY.md) ·
[reproducción](PE_03B1_PLAYBACK.md) ·
[pruebas](PE_03B1_TEST_MATRIX.md).

Los seis documentos de PE-03A:
[descubrimiento](PE_03A_TUTORIAL_DISCOVERY.md) ·
[almacenamiento](PE_03A_MEDIA_STORAGE_ARCHITECTURE.md) ·
[versionado](PE_03A_TUTORIAL_VERSIONING.md) ·
[bienvenida](PE_03A_WELCOME_ONBOARDING.md) ·
[cobertura](PE_03A_PAGE_KEY_COVERAGE.md) ·
[pruebas](PE_03A_TEST_STRATEGY.md).

### El estado de PE-02, en dos líneas

> **PE-02: CERRADO en Staging.**
> **Producción: no empezado, y empieza por aplicar 49 migraciones.**

La política de privacidad **v1.1 está vigente** desde el 31 de agosto de 2026 y
las **quince respuestas de seguridad están publicadas**. La v1 quedó archivada con
su texto intacto y sus 153 aceptaciones. El cierre está en
[`PE_02_FINAL_CLOSURE.md`](PE_02_FINAL_CLOSURE.md) y lo que falta mirar con los
ojos, en [`PE_02_FINAL_HUMAN_VALIDATION.md`](PE_02_FINAL_HUMAN_VALIDATION.md).

El plan que abrió la puerta de B5B —ya ejecutado— está en
[`PE_02B6_B5B_PUBLICATION_PLAN.md`](PE_02B6_B5B_PUBLICATION_PLAN.md), y lo que
se hizo al cruzarla, en
[`PE_02B5B_PUBLICATION.md`](PE_02B5B_PUBLICATION.md),
[`PE_02B5B_REACCEPTANCE.md`](PE_02B5B_REACCEPTANCE.md) y
[`PE_02B5B_SECURITY_FAQ_ACCEPTANCE.md`](PE_02B5B_SECURITY_FAQ_ACCEPTANCE.md).

Para revisar el contenido hay dos caminos, según se pueda entrar a la consola:

- **con consola** — [`PE_02B6_HUMAN_REVIEW_PACKAGE.md`](PE_02B6_HUMAN_REVIEW_PACKAGE.md),
  un recorrido de una hora por las pantallas;
- **sin consola** — [`PE_02B6_1_HUMAN_EDITORIAL_REVIEW.md`](PE_02B6_1_HUMAN_EDITORIAL_REVIEW.md),
  el texto exacto de la política y de las quince respuestas, con hoja de decisión.

Y lo que se corrigió después de aquella revisión, en
[`PE_02B6_2_FINAL_EDITORIAL_CHANGES.md`](PE_02B6_2_FINAL_EDITORIAL_CHANGES.md).

---

## PE-04 · Planes, límites y uso

| Tramo | Qué hizo | Migración | Estado |
|---|---|---|---|
| PE-04A | Descubrimiento y arquitectura comercial · 36 decisiones | — | **cerrado** · 2026-09-01 · pendiente de revisión humana |
| PE-04B1 | Catálogo canónico, revisiones y resolutor en sombra | **0162** | **cerrado** · 2026-09-01 |
| PE-04B2 | Base comercial cerrada, migración de empresas y cambio de autoridad | **0163** | **cerrado** · 2026-09-01 |
| PE-04B3…B6 | Aplicación de cuota, IA, tiempo activo y soporte | previstas | no empezado |

Los ocho de PE-04B2:
[base comercial](PE_04B2_FINAL_COMMERCIAL_BASELINE.md) ·
[revisiones sucesoras](PE_04B2_SUCCESSOR_PLAN_REVISIONS.md) ·
[reconocimiento](PE_04B2_MIGRATION_RECOGNITION.md) ·
[Free y la prueba](PE_04B2_FREE_TRIAL_LIFECYCLE.md) ·
[asignaciones](PE_04B2_ORGANIZATION_ASSIGNMENTS.md) ·
[cambio de autoridad](PE_04B2_CANONICAL_CUTOVER.md) ·
[la deuda Full→Demo](PE_04B2_FULL_DEMO_DEBT.md) ·
[pruebas](PE_04B2_TEST_MATRIX.md).

Los siete de PE-04B1:
[catálogo](PE_04B1_PLAN_CATALOG.md) ·
[revisiones y precio](PE_04B1_PLAN_REVISIONS.md) ·
[asignaciones](PE_04B1_ASSIGNMENT_MODEL.md) ·
[resolutor](PE_04B1_EFFECTIVE_RESOLVER.md) ·
[la prueba](PE_04B1_TRIAL_MODEL.md) ·
[comparación en sombra](PE_04B1_SHADOW_COMPARISON.md) ·
[pruebas](PE_04B1_TEST_MATRIX.md).

Los diez de PE-04A:
[descubrimiento](PE_04A_CURRENT_PLAN_DISCOVERY.md) ·
[Demo y Free](PE_04A_DEMO_FREE_ARCHITECTURE.md) ·
[catálogo y revisiones](PE_04A_PLAN_REVISION_MODEL.md) ·
[almacenamiento](PE_04A_STORAGE_USAGE_ARCHITECTURE.md) ·
[inteligencia](PE_04A_AI_USAGE_ARCHITECTURE.md) ·
[uso diario](PE_04A_DAILY_USE_ARCHITECTURE.md) ·
[soporte](PE_04A_SUPPORT_ENTITLEMENTS.md) ·
[migración de empresas](PE_04A_EXISTING_ORG_MIGRATION.md) ·
[seguridad y concurrencia](PE_04A_SECURITY_AND_CONCURRENCY.md) ·
[pruebas](PE_04A_TEST_STRATEGY.md).
Y las decisiones, en [PE_04A_DECISIONS.md](PE_04A_DECISIONS.md).

### PE-04B2 · la base comercial, y el fin de la doble verdad

> **Free · USD 0 · 50 MiB · 25 créditos de IA al mes · 30 min activos al día y
> 300 al mes.**
> **Full · USD 40 / USD 400 · 500 MiB · 500 créditos · sin límite de tiempo.**
> **Extra · USD 100 / USD 1 000 · 5 GiB · 2 000 créditos · 2 casos de
> acompañamiento al mes.**
> Precios **antes de impuestos**. Una empresa nueva nace con **Free permanente +
> prueba de Full de 48 h con 50 créditos en total**.
>
> **La deuda Full → «Plan Demo · 50 MB» está cerrada.** El plan comercial ya no
> sale de `organization_subscriptions`, y un fallo de lectura ya no se presenta
> como un plan: devuelve «no se pudo determinar» y **deniega**.
>
> Casi nada de esto se **aplica** todavía: el almacenamiento es **B3**, los
> créditos y los minutos **B4**, el acompañamiento **B5**, el cobro **PE-05**.
> B2 guarda la verdad comercial y la pone a mandar.

---

### PE-04B1 · los cimientos, en paralelo

> **0162 no cambia el comportamiento de ninguna empresa.** Ni una. Crea el
> catálogo canónico —`free`, `full`, `extra`—, las revisiones inmutables, las
> asignaciones con vigencia y un resolutor que devuelve **tres** respuestas:
> `found`, `absent` y **`unavailable`**.
>
> Los valores se **copiaron** del catálogo de hoy, byte a byte: Free hereda los
> límites del `demo` legacy, y Full y Extra los suyos. El precio de Full queda en
> 4000/40000 céntimos **antes de impuestos**; el de Extra, explícitamente **sin
> configurar**, que no es lo mismo que gratis.
>
> La autoridad sigue en el modelo de hoy. Cambiarla es **PE-04B2**, y antes hay
> que mirar el informe de la [comparación en sombra](PE_04B1_SHADOW_COMPARISON.md):
> en la base local, **15 de 20 filas** tienen las dos fuentes viejas en
> desacuerdo.

---

### El defecto Full → «Plan Demo · 50 MB», con causa

> **Reproducido, y no es cosmético del todo.** Hay **dos** fuentes de verdad de
> plan: `organization_modules.access_mode` —que es la autoridad desde T9F.1 y la
> que aplica el servidor— y `organization_subscriptions.plan_code`, que
> `create_organization` deja en `demo` y **nadie vuelve a tocar**. La vista de
> uso lee la segunda, y de ahí salen «Plan Demo» y los 50 MB.
>
> **La cuota que se aplica de verdad es la correcta** (`begin_cpr_storage_upload`
> lee el `access_mode` del módulo). Lo que está mal es lo que se enseña. En la
> base local, **el 100 % de las empresas** tiene las dos fuentes en desacuerdo.

---

### El estado de PE-03, en dos líneas

> **PE-03: CERRADO / PASS.** Arquitectura, medios, consola, tutoriales de
> pantalla, bienvenida, preferencias, cobertura y endurecimiento, completos.
> **Producción: sin tocar, en 0111.**

Quedan tres cosas y ninguna bloquea la implementación: **grabar los vídeos**
(editorial), **los subtítulos** (deuda de accesibilidad, la arquitectura ya los
admite) y **retirar `qa-a`**, que se aplazó al **corte de producción** — sigue
activo a propósito, y está escrito en
[`PE_03_PRODUCTION_CUTOVER_CARRYOVERS.md`](PE_03_PRODUCTION_CUTOVER_CARRYOVERS.md)
para que aparezca en la lista de verificación de PE-06.

El cierre completo, en [`PE_03_FINAL_CLOSURE.md`](PE_03_FINAL_CLOSURE.md).

---

### La cobertura de tutoriales, completa

> **De 11 pantallas a 152.** Cada pantalla funcional de Quality, PCR y Textiles
> puede tener su vídeo; las 37 que no, están excluidas con su motivo escrito.

Que una pantalla no tenga vídeo **no es un fallo**: el tramo hizo posible
grabarlos, no los grabó. Una prueba recorre `app/` y falla si nace una pantalla
que nadie clasificó, así que esto no se puede quedar viejo en silencio. El
detalle, en [`PE_03B4_COMPLETE_TUTORIAL_COVERAGE.md`](PE_03B4_COMPLETE_TUTORIAL_COVERAGE.md).

---

### El tope de tamaño de los tutoriales, revocado

> **PE-03B1 congeló 200 MB por archivo. PE-03B3 lo revocó, y no lo sustituyó
> por otro número.** Tampoco hay duración máxima.

Es una decisión del propietario del producto, del 31 de agosto de 2026. Los seis
documentos anteriores que describen aquel tope llevan un aviso de
`SUPERSEDED BY PRODUCT OWNER DECISION` y **conservan su texto**: son el informe
de lo que se hizo entonces, y reescribirlos dejaría sin explicación las
decisiones que sí se tomaron con esa regla puesta. Lo que rige hoy está en
[`PE_03B3_LARGE_MEDIA_ARCHITECTURE.md`](PE_03B3_LARGE_MEDIA_ARCHITECTURE.md).

---

## Confirmaciones que solo puede dar una persona

| | Estado |
|---|---|
| ¿Autorización de uso de datos para entrenamiento? | **respondida** · no · 2026-08-31 |
| ¿Retención cero contratada? | **respondida** · no · 2026-08-31 |
| ¿Qué proveedor de IA usa el entorno desplegado? | **respondida** · OpenAI · 2026-08-31 |
| ¿Se nombra al proveedor en el texto público? | **abierta** · no bloquea publicar |
| ¿Se publica la política de privacidad v1.1? | **respondida** · sí · publicada 2026-08-31 |
| ¿Se publican las quince respuestas de seguridad? | **respondida** · sí · publicadas 2026-08-31 |
| ¿Hay un tamaño máximo por vídeo de tutorial? | **respondida** · no · revocado 2026-08-31 |
| ¿Hay una duración máxima por vídeo? | **respondida** · no · 2026-08-31 |
| ¿Ver un tutorial depende del plan contratado? | **respondida** · no · 2026-08-31 |
| ¿Entró `idendilatam@gmail.com` al Preview? | **abierta** · bloquea revocar `qa-a` |
| ¿Se autoriza retirar a `qa-a`? | **respondida** · sí · 2026-08-31 |
| ¿«No volver a mostrar» sobrevive a una versión nueva? | **respondida** · sí · 2026-08-31 |
| ¿Cerrar la bienvenida la suprime para siempre? | **respondida** · no · solo la sesión |

---

## Cabeceras de migración

| Entorno | Cabecera |
|---|---|
| Local | **0163** |
| Staging | **0163** |
| Producción | **0111** |

Producción no tiene las tablas de la FAQ ni las de la ayuda. Publicar allí no es
un paso de B5B: es una decisión aparte que empieza por aplicar 49 migraciones.

---

## Lo que queda pendiente y está escrito

- [`PE_02B6_DEFERRED_HELP_BACKLOG.md`](PE_02B6_DEFERRED_HELP_BACKLOG.md) — las
  siete familias de pantalla sin ayuda contextual administrada, y por qué no se
  inventó contenido para ellas.
- **Retirar `qa-a@trazaloop-staging.local`.** La operación está escrita, probada
  y **no ejecutada**: necesita credenciales de Staging que no viven en el
  repositorio. Ver
  [`PE_03B4_SUPERADMIN_RETIREMENT.md`](PE_03B4_SUPERADMIN_RETIREMENT.md).
- **Grabar los vídeos.** Hay 152 pantallas listas para recibir uno y ninguna lo
  tiene todavía. Es trabajo editorial, no técnico.
- PE-03B5 · endurecimiento. La cobertura ya no está pendiente: la cerró B4.
