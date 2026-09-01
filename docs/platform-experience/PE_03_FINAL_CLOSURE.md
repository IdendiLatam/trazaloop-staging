# PE-03 · Tutoriales y bienvenida audiovisual · CIERRE

Cinco tramos, tres migraciones, un subsistema completo. Esto es lo que quedó en
pie y lo que se aplazó, con la diferencia dicha claramente.

---

## 1 · Lo que existe hoy

| | |
|---|---|
| Pantallas del producto clasificadas | **187** — ninguna sin clasificar |
| Objetivo de tutorial | **152 claves** sobre 150 rutas |
| Excluidas a propósito, con motivo | **37** |
| Migraciones | **0159**, **0160**, **0161** |
| Cabecera | Local **0161** · Staging **0161** · Producción **0111** |
| Vídeos publicados | **ninguno todavía** — y no es un fallo |

Lo último merece decirse sin rodeos: PE-03 construyó el sitio donde van los
vídeos, no los vídeos. Una pantalla registrada sin vídeo enseña la copia
congelada y el botón sigue donde está. Grabar es trabajo editorial, y se puede
hacer sin desplegar.

---

## 2 · Los cinco tramos

| Tramo | Qué hizo | Migración |
|---|---|---|
| **PE-03A** | Descubrimiento, arquitectura de medios, 48 decisiones congeladas | — |
| **PE-03B1** | Identidad, versiones inmutables, cubo privado, reserva y RLS | 0159 |
| **PE-03B2** | La consola de superadministrador | — |
| **PE-03B3** | El tutorial de pantalla · **el tope de tamaño, revocado** | 0160 |
| **PE-03B4** | Bienvenida, preferencias por persona, **cobertura completa** | 0161 |
| **PE-03B5** | Cierre: recuento, residuos, endurecimiento y aceptación integrada | — |

Más el [incidente de la sonda de QA](PE_03_QA_PROBE_INCIDENT.md), que no fue un
tramo pero cambió cómo se limpia.

---

## 3 · Las cinco decisiones que sostienen todo

**La ruta no es la identidad.** Un tutorial se identifica por su clave de
pantalla. Si una pantalla se muda, se corrige su `route` en el registro y el
tutorial no se entera. La prueba más clara está en el propio registro:
`quality.intelligence` vive en `/quality/copilot`.

**Los bytes no pasan por Next.js.** Del navegador a Storage, por transporte
reanudable autenticado con la sesión de la persona — que además **ejerce** la
política del cubo, al contrario que una URL firmada, que 0099 demostró que se la
salta.

**Sin dato NO es cero.** «No hay vídeo» y «no se pudo leer» significan cosas
opuestas y se dicen distinto. Donde alguien pulsó un botón, una avería se
anuncia; donde nadie pulsó nada, no se abre nada.

**Publicar es más que cambiar un estado.** Archivar la vigente con su fecha,
activar la nueva, enlazarlas y dejar constancia de quién. Cuatro cosas en una
transacción, por una primitiva, siempre.

**La historia no se reescribe para limpiar.** Una versión publicada no se borra,
no cambia de resumen, no cambia de ruta y no cambia de autor. Una limpieza de QA
que borró el objeto de una publicada dejó una inconsistencia permanente — y la
respuesta correcta fue documentarla, no inventar bytes.

---

## 4 · Lo que PE-03B5 encontró y arregló

Un cierre que no encuentra nada no ha mirado.

**Cuatro suites dejaban superadministradores vivos.** `pe03b1-tutorials`,
`pe03b1-upload-security`, `pe03b1-playback` y `pe03b2-tutorial-admin` limpiaban
sus tutoriales con cuidado y no retiraban las cuentas privilegiadas que creaban.
Es la misma forma del incidente de Staging. Corregido: quien crea un acceso
privilegiado lo cierra.

**Dos suites publicaban sobre la misma identidad.** La suite integrada de B5 y la
de B2 usaban `quality.processes`, y una versión publicada no se puede borrar
—que es justo lo que el subsistema promete—, así que la segunda en correr veía
una publicación que no era suya. La integrada usa ahora su propia clave.

**Una prueba mía pasaba por casualidad.** Corría sobre una clave con historia
heredada y exigía «al menos tres periodos», y eso se cumplía sin que la prueba
demostrara nada. Sobre una clave limpia se vio lo cierto: reponer **no publica**,
publicar es un paso aparte, y ahora eso es lo que se comprueba.

**Mi primer inventario del cubo bajaba dos niveles** y las rutas tienen tres.
Declaró rotas doce versiones sanas. Un inventario que lee mal produce un informe
de catástrofe.

**Mis comprobaciones estáticas leían las migraciones concatenadas** y encontraban
el tope de 200 MB en el texto de 0159, que lo tiene porque así fue. Confundir la
historia con el estado es exactamente lo que este subsistema evita en los datos.

---

## 5 · Lo que queda, y de qué tipo es cada cosa

Ninguno de los tres es un bloqueante de implementación de PE-03.

### EDITORIAL · grabar los vídeos

152 pantallas listas y ninguna con vídeo. La primera ola recomendada —doce, con
su porqué— está en
[PE_03B5_TUTORIAL_ROLLOUT_PLAN.md](PE_03B5_TUTORIAL_ROLLOUT_PLAN.md), y el guion
de la bienvenida en
[PE_03B5_WELCOME_VIDEO_BRIEF.md](PE_03B5_WELCOME_VIDEO_BRIEF.md).

Se sube y se publica desde la consola. **Sin desplegar.**

### ACCESIBILIDAD · subtítulos

No son obligatorios todavía y **la arquitectura los admite**: la versión guarda
metadatos y el objeto es inmutable, así que una pista de subtítulos entra como un
campo más sin tocar el modelo de versiones ni el cubo.

Queda como deuda de accesibilidad, anotada y no bloqueante. Mientras tanto, el
guion de la bienvenida pide texto en pantalla, que es lo más cerca que se puede
estar sin ello.

### CORTE DE PRODUCCIÓN · retirar `qa-a`

`qa-a@trazaloop-staging.local` sigue activo **a propósito**, y su retirada se
movió al corte a Producción por decisión del propietario del producto.

**No bloquea PE-03.** Es un elemento de la lista de verificación de publicación
y tiene que aparecer en PE-06:
[PE_03_PRODUCTION_CUTOVER_CARRYOVERS.md](PE_03_PRODUCTION_CUTOVER_CARRYOVERS.md).

---

## 6 · Lo que se comprobó, en números

| | |
|---|---|
| Pruebas de PE-03 | **B1** 69 · **B2** 63 · **B3** 48 · **B4** 96 · **B5** 89 |
| Sonda de QA | 11 |
| `npm run test:all` | EXIT 0 |
| Reejecución limpia 0001 → 0161 | 0 fallos, 153 migraciones |
| Consultas de la consola con 152 pantallas | **2** |
| Consultas al pintar una pantalla | **0** |
| Pico de memoria verificando | **64 KB** sobre 4 MB |

---

## 7 · Los documentos

**PE-03A** · [descubrimiento](PE_03A_TUTORIAL_DISCOVERY.md) ·
[almacenamiento](PE_03A_MEDIA_STORAGE_ARCHITECTURE.md) ·
[versionado](PE_03A_TUTORIAL_VERSIONING.md) ·
[bienvenida](PE_03A_WELCOME_ONBOARDING.md) ·
[cobertura](PE_03A_PAGE_KEY_COVERAGE.md) ·
[pruebas](PE_03A_TEST_STRATEGY.md)

**PE-03B1** · [datos](PE_03B1_TUTORIAL_DATA_FOUNDATION.md) ·
[almacenamiento](PE_03B1_MEDIA_STORAGE.md) · [subida](PE_03B1_UPLOAD_SECURITY.md) ·
[versiones](PE_03B1_VERSION_HISTORY.md) · [reproducción](PE_03B1_PLAYBACK.md) ·
[pruebas](PE_03B1_TEST_MATRIX.md)

**PE-03B2** · [consola](PE_03B2_SUPERADMIN_TUTORIALS.md) ·
[subida](PE_03B2_UPLOAD_WORKFLOW.md) ·
[publicación](PE_03B2_PUBLICATION_HISTORY.md) · [reponer](PE_03B2_RESTORE_WORKFLOW.md) ·
[pruebas](PE_03B2_TEST_MATRIX.md) · [revisión](PE_03B2_HUMAN_VALIDATION.md)

**PE-03B3** · [tutorial de pantalla](PE_03B3_PAGE_TUTORIAL_EXPERIENCE.md) ·
[medios sin tope](PE_03B3_LARGE_MEDIA_ARCHITECTURE.md) ·
[renovación](PE_03B3_PLAYBACK_RENEWAL.md) ·
[traspaso](PE_03B3_SUPERADMIN_HANDOVER.md) ·
[cobertura](PE_03B3_PAGE_KEY_COVERAGE.md) · [pruebas](PE_03B3_TEST_MATRIX.md) ·
[revisión](PE_03B3_HUMAN_VALIDATION.md)

**PE-03B4** · [bienvenida](PE_03B4_WELCOME_VIDEO.md) ·
[preferencias](PE_03B4_USER_PREFERENCES.md) ·
[cobertura completa](PE_03B4_COMPLETE_TUTORIAL_COVERAGE.md) ·
[acceso de plataforma](PE_03B4_PLATFORM_STAFF_ACCESS.md) ·
[retirada de qa-a](PE_03B4_SUPERADMIN_RETIREMENT.md) ·
[pruebas](PE_03B4_TEST_MATRIX.md) · [revisión](PE_03B4_HUMAN_VALIDATION.md)

**PE-03B5** · [cobertura final](PE_03B5_FINAL_COVERAGE.md) ·
[residuos](PE_03B5_QA_RESIDUE_AUDIT.md) · [endurecimiento](PE_03B5_HARDENING.md) ·
[aceptación integrada](PE_03B5_INTEGRATED_ACCEPTANCE.md) ·
[plan editorial](PE_03B5_TUTORIAL_ROLLOUT_PLAN.md) ·
[guion de la bienvenida](PE_03B5_WELCOME_VIDEO_BRIEF.md) ·
[corte de producción](PE_03_PRODUCTION_CUTOVER_CARRYOVERS.md)

---

## 8 · Estado

> **PE-03 · CERRADO / PASS.**
>
> Arquitectura, medios, consola de superadministrador, tutoriales de pantalla,
> bienvenida, preferencias, cobertura y endurecimiento: **completos**.
>
> Producción: sin tocar, en 0111.
