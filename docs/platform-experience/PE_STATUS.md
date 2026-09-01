# Experiencia de plataforma · dónde está cada cosa

Una sola página para no tener que abrir los ochenta y dos documentos de
`docs/platform-experience/`.

*Actualizado el 31 de agosto de 2026, al cierre de PE-03B3.*

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
| PE-03B4 | Bienvenida y preferencia por persona | 1 prevista | no empezado |
| PE-03B5 | Cobertura y endurecimiento | — | no empezado |

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

---

## Cabeceras de migración

| Entorno | Cabecera |
|---|---|
| Local | **0160** |
| Staging | **0160** |
| Producción | **0111** |

Producción no tiene las tablas de la FAQ ni las de la ayuda. Publicar allí no es
un paso de B5B: es una decisión aparte que empieza por aplicar 49 migraciones.

---

## Lo que queda pendiente y está escrito

- [`PE_02B6_DEFERRED_HELP_BACKLOG.md`](PE_02B6_DEFERRED_HELP_BACKLOG.md) — las
  siete familias de pantalla sin ayuda contextual administrada, y por qué no se
  inventó contenido para ellas.
- PE-03B4 · la ventana de bienvenida y la preferencia por persona. No empieza
  hasta que la prueba humana de PE-03B3 esté hecha.
- Revocar `qa-a@trazaloop-staging.local`. Sigue activo a propósito: es la puerta
  de repuesto hasta que se confirme que `idendilatam@gmail.com` entra bien.
- PE-03B5 · cobertura. Hoy hay tutoriales posibles en **11** de las 147
  pantallas del shell; ver
  [`PE_03B3_PAGE_KEY_COVERAGE.md`](PE_03B3_PAGE_KEY_COVERAGE.md).
