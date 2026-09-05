# Experiencia de plataforma · dónde está cada cosa

Una sola página para no tener que abrir los ciento veintitrés documentos de
`docs/platform-experience/`.

*Actualizado el 2 de septiembre de 2026, al cerrarse el código de PE-05B2.*

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

## PE-05 · Precio, cobro y pagos

| Tramo | Qué hizo | Migración | Estado |
|---|---|---|---|
| PE-05A | Descubrimiento y arquitectura de cobro · 63 decisiones | — | **cerrado** · 2026-09-02 · pendiente de revisión humana |
| PE-05B1 | Cimientos de facturación · presupuestos, suscripciones, pagos, cambio e impuestos con vigencia | **0169** | **cerrado** · 2026-09-02 |
| PE-05B2 | Mercado Pago en pruebas · proveedor, suscripciones y webhooks | **0171** | **bloqueado** · el sandbox exige un pagador MCO que su panel no expone |
| PE-05B2W | Wompi · viabilidad como proveedor paralelo | — | **descubrimiento cerrado** · 2026-09-03 · recomendado para sandbox |
| PE-05B2W1 | Wompi en pruebas · fuente de pago y cobro recurrente | **0171** | **cerrado** · 2026-09-04 · listo para la prueba de webhook |
| PE-05B2W2 | Wompi · webhook real | **0171** | **cerrado** · 2026-09-04 · evento real firmado, conciliado y liquidado una vez |
| PE-05B2W3 | Wompi · enrutado de renovación y alcance del derecho | **0171** | **enrutado PASS · periodo con DEFECTO** · 2026-09-04 |
| PE-05B2W3.1 | Facturación · el periodo como objeto propio | **0172** | **calendario e identidad demostrados en real · renovación BLOQUEADA por el medio de pago** · 2026-09-04 |
| PE-05B2W3.2 | Facturación · el medio de pago reutilizable y la renovación por periodo | **0173** | **renovación real PASS · misma tarjeta, mes real, reentrega inerte** · 2026-09-04 |
| PE-05B2W4 | Facturación · contratación con tarjeta desde el navegador | **0173** | **PASS · compra humana real verificada en servidor** · 2026-09-04 |
| PE-05B5A | Facturación · arquitectura del cobro automático | **0173** | **arquitectura lista · dos defectos del dominio de periodos encontrados** · 2026-09-04 |
| PE-05B5B | Facturación · cimientos del cobro automático | **0174** | **PASS · defectos AA/AB reparados, 20 pruebas deterministas, sin planificador** · 2026-09-04 |
| PE-05B5C | Facturación · ciclo de vida completo y puerta en seco | **0175** | **PASS · sin tarjeta, en duda, cancelación y bajada de plan · ruta sin capacidad de cobro** · 2026-09-05 |
| PE-05B5D | Facturación · renovación real desde el planificador | **0176** | **PASS · un cobro real, webhook firmado, sin tipo de cambio vigente · ejecución apagada** · 2026-09-05 |
| PE-05B5E | Facturación · el lado que falla, gracia y operación | **0177** | **PASS · cuatro defectos de vencimiento y huecos corregidos · ejecución apagada** · 2026-09-05 |
| PE-05B5F | Facturación · operación, decisiones del cliente y cierre de B5 | **0178** | **PASS · consola de renovaciones, cancelar y bajar de plan, contrato en 19 comprobaciones** · 2026-09-05 |
| PE-05B6A | Facturación · arquitectura de cupones y cambios de plan | **0178** | **arquitectura lista · duración del cupón BLOQUEADA (decisión de producto)** · 2026-09-05 |
| PE-05B3…B6 | Precio final, checkout, consola y precios públicos | previstas | no empezado |

Los diez de PE-05B1:
[cimientos](PE_05B1_BILLING_FOUNDATION.md) ·
[presupuestos](PE_05B1_QUOTES.md) ·
[suscripciones](PE_05B1_SUBSCRIPTIONS.md) ·
[pagos](PE_05B1_PAYMENTS.md) ·
[tipo de cambio](PE_05B1_FX.md) ·
[tratamiento fiscal](PE_05B1_TAX_TREATMENT.md) ·
[la futura exención](PE_05B1_FUTURE_SELF_SERVICE_EXEMPTION.md) ·
[del pago al derecho](PE_05B1_ENTITLEMENT_INTEGRATION.md) ·
[seguridad](PE_05B1_SECURITY.md) ·
[pruebas](PE_05B1_TEST_MATRIX.md).

> **Política fiscal de lanzamiento: 19 % en Full, Extra y Acompañamiento.** El
> SaaS autogestionable podría llegar a estar exento, pero falta el
> autodiagnóstico, el visto bueno contable y la aprobación de MinTIC. **No se
> sembró ninguna regla al 0 %**, ni en borrador. Activarla en Producción sin esas
> tres cosas es un **bloqueador de corte para PE-06**.

> **No se fijó ningún tipo de cambio.** Inventarlo habría sido inventar un
> precio: sin tasa vigente el presupuesto falla y lo dice. Hay que fijarla antes
> de vender en cualquier entorno.

> **PE-05B2 no se empezó.** Su comprobación previa obligatoria encontró una
> regresión de PE-04: una empresa **en prueba** recibía los **500** créditos
> mensuales de Full en vez de los **25** de Free, y al caducar la prueba quedaba
> `OVER_LIMIT` sin haber excedido nada. Ni una línea de Mercado Pago se
> escribió. El hallazgo:
> [comprobación previa de PE-05B2](PE_05B2_PREFLIGHT_TRIAL_AI.md).

> **El periodo no avanzó un mes: avanzó seis minutos.** La renovación ancla el
> periodo nuevo en **la fecha del pago** y no en el final del ya pagado, así que
> quien paga antes de vencer **pierde** lo que le quedaba —hasta un mes—. Se
> cobró dos veces y el derecho terminó el mismo 4 de octubre. Y hay un segundo
> hueco: **nada ata una renovación a un periodo**, así que dos cobros distintos
> para el mismo mes pasarían los dos. No se tocó código: hace falta decidir.
> [El defecto del periodo](PE_05B2W3_PERIOD_DEFECT.md).

> **Contratar y renovar son cosas distintas, y ya van por caminos distintos.**
> La contratación real dejó **1 suscripción viva** y **3 asignaciones vendidas**
> —exactamente los módulos habilitados; `core` no, y pagar no habilitó nada—. La
> renovación real se enrutó por su primitiva: **2 cobros, 1 suscripción, periodo
> avanzado una vez**, y seis reentregas no lo movieron. De paso se corrigió la
> referencia, que daba a entender que una contratación puede cobrarse varias
> veces. **Sin migración: 0171.**
> [Enrutado de renovación](PE_05B2W3_RENEWAL_ROUTING.md).

> **Una URL de webhook que no caduca.** La registrada apuntaba a un despliegue
> concreto, así que cada commit dejaba a Wompi hablando con código viejo — ya
> pasó una vez. No existía ningún alias que registrar, así que se creó:
> `trazaloop-pe05-sandbox.vercel.app`, comprobado que **sigue protegido** y que
> sirve el último despliegue. Hay que registrarlo **una vez** y no volver a
> tocar el panel.
> [URL estable](PE_05B2W3_STABLE_WEBHOOK_URL.md).

> **El webhook real de Wompi llegó, y liquidó una vez.** Firma verificada,
> `environment: test`, relectura de la transacción, conciliación exacta —190 400
> COP de punta a punta— y `billing_settle_provider_payment`. Seis entregas del
> mismo evento: **un** cobro y **una** suscripción. Antes de que costara caro se
> encontró que la referencia de Wompi lleva el número de intento y la
> liquidación esperaba el intento desnudo. Lo que **no** se demostró es la
> asignación vendida: las empresas sintéticas no tienen ningún módulo
> habilitado, y *pagar no concede módulos*. Detalle en
> [el webhook real](PE_05B2W2_REAL_WEBHOOK.md).

> **La puerta de Wompi está lista; falta registrarla.** Sin bypass el Preview
> sigue devolviendo 401, y con bypass un evento sin firma válida recibe
> **401** y **cero efecto financiero**: el bypass es transporte, no
> autenticación del proveedor. Antes de entregar la URL se corrigió una regla
> que habría rechazado entregas legítimas —el entorno lo establece **la firma**,
> no un campo que la documentación ni siquiera trae—.
> [Registro del webhook](PE_05B2W2_WEBHOOK_REGISTRATION.md).

> **Wompi cobró dos veces sobre la misma tarjeta.** Fuente de pago guardada y
> **dos transacciones aprobadas** de 190 400 COP, la segunda con
> `recurrent: true` y sin volver a pedir la tarjeta. Es el modelo que el cobro
> anual necesitaba. Sin migración —la cabecera sigue en 0171—, sin planificador
> y sin registrar el webhook todavía. La trampa de este proveedor está aislada
> y probada: cuenta centésimas de peso, y mandarle el número de B1 tal cual
> cobraría cien veces menos. Detalle en
> [Wompi en pruebas](PE_05B2W1_WOMPI_SANDBOX.md).

> **Wompi, recomendado para el sandbox.** No programa la recurrencia —la
> inicia el comercio—, y eso convierte el cobro anual en una transacción cada
> doce meses: **la incógnita que bloquea B2 desaparece**. Además su entorno
> **sí** se distingue por la llave, que es justo lo que Mercado Pago no
> permite. El coste es nuestro: el calendario pasa a ser de Trazaloop. Análisis
> completo, con tarifas y riesgos, en
> [viabilidad de Wompi](PE_05B2W_WOMPI_FEASIBILITY.md).

> **El flujo pendiente probado; el pagador vuelve a bloquear.** Se retiró la
> conclusión anterior sobre la clase de credencial —era una extrapolación— y se
> probó el modelo documentado: `status: "pending"`, sin plan y sin tarjeta, con
> el pagador del ejemplo oficial. Respuesta: **«Payer is associated with a
> different site»**. Con eso queda observado que `payer_email` **debe ser un
> usuario de Mercado Pago existente del sitio MCO**, y volvemos al mismo punto:
> ese correo no lo expone ni la API ni el panel. Cero artefactos; tasa QA
> cerrada otra vez. Detalle en
> [el bloqueo del pagador](PE_05B2_PENDING_PAYER_BLOCK.md).

> **Ni las credenciales de PRUEBA son de prueba para Mercado Pago.** Se
> sustituyó el token por el de *Pruebas → Credenciales de prueba* de la
> aplicación del vendedor de prueba, y `POST /v1/customers` devuelve **la misma
> causa 300, «Unauthorized use of live credentials»**. Identidad del dueño y
> clase de credencial son **dos ejes distintos**, y el nuestro era más
> permisivo que el del proveedor. La regla propuesta —y no implementada, por no
> improvisar— está en
> [clase de credencial](PE_05B2_CREDENTIAL_CLASS.md).

> **PE-05B2 congelado, esperando a soporte de Mercado Pago.** El bloqueo es
> externo: no hay forma documentada ni alcanzable por API de obtener el
> `payer_email` que la propia API exige. Las cuatro preguntas y toda la
> evidencia saneada están en
> [el paquete para soporte](PE_05B2_MERCADOPAGO_SUPPORT_PACK.md).

> **Tasa sintética RETIRADA.** Ya no es efectiva: su periodo se cerró y quedó
> marcada `retired`, sin borrar la fila. Un presupuesto nuevo que necesite
> USD→COP falla ahora con `FX_RATE_UNAVAILABLE`, y los seis presupuestos
> históricos conservan el tipo con el que se calcularon. El *carryover* queda
> **cerrado**.

> **El vendedor ya es de prueba; el pagador sigue sin existir.** El cambio de
> credenciales funcionó y está verificado **por identidad**: `test_user`,
> `MCO`, `CO`. De paso quedó corregido el clasificador, que decidía por el
> prefijo del token y habría bloqueado justo el entorno de pruebas —ahora
> exige evidencia positiva del proveedor y falla cerrado—. Pero
> `POST /v1/customers` responde **401 access denied** y el `payer_email` con el
> formato que la propia referencia documenta responde **400 User bad request**.
> El anual **sigue sin poder preguntarse**. Cero artefactos.
> Detalle en [el cambio de vendedor](PE_05B2_TEST_SELLER_CUTOVER.md).

> **Tres rechazos, una sola causa: la cuenta vendedora es real, no de prueba.**
> El pagador técnico —un cliente con el correo `test_payer_…@testuser.com` que
> la propia referencia documenta— fue rechazado con `invalid domain user email`.
> Junto con los dos rechazos anteriores, todo apunta a lo mismo: la cuenta
> vendedora es `user_type: normal`, **sin la etiqueta `test_user`**, y el
> sandbox de Mercado Pago espera operar con el token de un **vendedor de
> prueba**. Cero clientes y cero suscripciones creados. El anual **sigue sin
> poder preguntarse**. Detalle en
> [el pagador de pruebas](PE_05B2_TEST_PAYER_MODEL.md).

> **Comprador MCO creado; la API ya no devuelve su correo.** Se creó una
> identidad de prueba dedicada del sitio **MCO**, activa, con sus credenciales
> guardadas fuera del repositorio. Pero Mercado Pago **no devuelve el correo del
> usuario de prueba** —ni al crearlo ni al leerlo— aunque su propia referencia
> lo documente. Dos formas derivadas del apodo y del identificador movieron el
> error de «otro sitio» a «User bad request»: el sitio ya no falla, la dirección
> sí. Hace falta leerla en *Tus integraciones → Cuentas de prueba*.
> Cero artefactos en el proveedor. Detalle en
> [el comprador de prueba](PE_05B2_TEST_BUYER_IDENTITY.md).

> ~~CARRYOVER · RETIRE QA SYNTHETIC FX RATE~~ · **hecho el 3 de septiembre de
> 2026**: retirada por vigencia, sin borrar la fila. `billing_resolve_fx`
> devuelve `no_active_rate`.

> **Se llamó al proveedor, y rechazó por el pagador.** El bypass de
> automatización de Vercel funcionó sin tocar el SSO, el token clasifica como
> **prueba** y B1 calculó los importes sin una cifra escrita a mano. Mercado
> Pago devolvió `Payer is associated with a different site` en las cuatro
> llamadas: la cuenta vendedora **sí** es colombiana (`MCO`), así que lo que
> falla es que `test@testuser.com` no es un comprador de ese sitio. Valida el
> pagador antes que la recurrencia, así que **el anual sigue sin respuesta**.
> Cero artefactos en el proveedor, comprobado preguntándole.
> Detalle en [la llamada real](PE_05B2_PROVIDER_SMOKE_1_RESULT.md).

> **PE-05B2 · el código está y el sandbox no.** El adaptador, la firma, la
> conciliación y el libro de notificaciones están construidos y probados —66
> comprobaciones—, pero **no hay credenciales de prueba de Mercado Pago**, así
> que no se ha hecho ni una llamada real. Y el Preview está detrás de Vercel
> SSO, que **no se desactivó**: la entrega real de un webhook necesita una
> decisión de infraestructura. Dos cosas quedan sin demostrar: que el proveedor
> acepte el **cobro anual** y **cuándo** aplica un cambio de importe. Todo en
> [la puesta a punto](PE_05B2_CREDENTIAL_SETUP.md) y en
> [las pruebas](PE_05B2_SANDBOX_TESTS.md).

> **Regresión cerrada en `0170`.** La bolsa mensual sale ahora del plan comercial
> **no-prueba**, con una regla general —no un 25 fijo—: Free+prueba da 25, Full
> comprado+prueba da 500, Extra da 2 000. Sin plan no-prueba resoluble se
> deniega, no se cae a 25. Ni una fila del libro de créditos se tocó, y en
> Staging el diagnóstico encontró **cero** empresas afectadas: el libro estaba
> vacío. Todo escrito en
> [la bolsa mensual y la prueba](PE_04_TRIAL_AI_MONTHLY_POOL.md).

Los doce de PE-05A:
[descubrimiento y alcance](PE_05A_PAYMENT_DISCOVERY.md) ·
[proveedor](PE_05A_PROVIDER_ARCHITECTURE.md) ·
[moneda](PE_05A_CURRENCY_AND_FX.md) ·
[impuestos](PE_05A_TAX_ARCHITECTURE.md) ·
[presupuesto](PE_05A_BILLING_QUOTE.md) ·
[ciclo de vida](PE_05A_SUBSCRIPTION_LIFECYCLE.md) ·
[webhooks](PE_05A_WEBHOOK_ARCHITECTURE.md) ·
[cupones](PE_05A_COUPON_ARCHITECTURE.md) ·
[seguridad](PE_05A_CHECKOUT_SECURITY.md) ·
[Acompañamiento](PE_05A_ADVISOR_COMMERCIAL_MODEL.md) ·
[pruebas](PE_05A_TEST_STRATEGY.md) ·
[decisiones PAY-01…PAY-63](PE_05A_DECISIONS.md).

> **No hay una sola línea de código de pagos en el repositorio.** Se buscó por
> los once proveedores habituales, por `webhook`, `coupon`, `invoice` y
> `refund`: cero. PE-05 parte de cero, con dos ganchos que PE-04B1 dejó listos
> (`source='checkout'` y `grant_kind='sold'`).

> **La decisión que bloquea todo lo demás:** ¿USD 40 compra Full para **toda la
> empresa** o para **un módulo**? Los cuatro recursos que definen el plan
> —almacenamiento, Intelligence, tiempo y soporte— ya son de empresa, así que
> cobrar por módulo obligaría a rehacerlos. Recomendación y números en
> [PE_05A_PAYMENT_DISCOVERY.md](PE_05A_PAYMENT_DISCOVERY.md).

---

## PE-04 · Planes, límites y uso

| Tramo | Qué hizo | Migración | Estado |
|---|---|---|---|
| PE-04A | Descubrimiento y arquitectura comercial · 36 decisiones | — | **cerrado** · 2026-09-01 · pendiente de revisión humana |
| PE-04B1 | Catálogo canónico, revisiones y resolutor en sombra | **0162** | **cerrado** · 2026-09-01 |
| PE-04B2 | Base comercial cerrada, migración de empresas y cambio de autoridad | **0163** | **cerrado** · 2026-09-01 |
| PE-04B3 | Cuota de almacenamiento única por empresa, reserva y seguridad por encima del límite | **0164** | **cerrado** · 2026-09-01 |
| PE-04B4 | Créditos ponderados de Intelligence y reloj de uso de Free | **0166** | **cerrado** · 2026-09-01 |
| PE-04B5 | Derechos de soporte y consola comercial | **0167** | **cerrado** · 2026-09-01 |
| PE-04B6 | Aceptación integrada de PE-04 y transición comercial corregida | **0168** | **cerrado** · 2026-09-02 |

Los ocho de PE-04B6:
[ciclo integrado](PE_04B6_INTEGRATED_LIFECYCLE.md) ·
[los ejes juntos](PE_04B6_CROSS_AXIS_ACCEPTANCE.md) ·
[verdad comercial y el defecto](PE_04B6_COMMERCIAL_TRUTH.md) ·
[seguridad](PE_04B6_SECURITY_ACCEPTANCE.md) ·
[residuos de QA](PE_04B6_QA_RESIDUES.md) ·
[preparación](PE_04B6_RELEASE_READINESS.md) ·
[cierre de PE-04](PE_04_FINAL_CLOSURE.md) ·
[la transición corregida](PE_04B6_PLAN_TRANSITION_FIX.md) ·
[corte de producción](PE_04_PRODUCTION_CUTOVER_CARRYOVERS.md).

> **Dos defectos encontrados y cerrados en 0168.** Una bajada de plan no bajaba
> —se insertaba la asignación nueva sin cerrar la anterior— y la transición
> dependía del reloj del proceso de la aplicación en vez del de la base. El
> segundo apareció probando el primero. Detalle en
> [PE_04B6_PLAN_TRANSITION_FIX.md](PE_04B6_PLAN_TRANSITION_FIX.md).

Los ocho de PE-04B5:
[inventario de soporte](PE_04B5_SUPPORT_INVENTORY.md) ·
[derechos](PE_04B5_SUPPORT_ENTITLEMENTS.md) ·
[casos funcionales](PE_04B5_FUNCTIONAL_CASES.md) ·
[prioridad](PE_04B5_SUPPORT_PRIORITY.md) ·
[consola comercial](PE_04B5_COMMERCIAL_CONSOLE.md) ·
[revisiones](PE_04B5_PLAN_REVISION_UX.md) ·
[vista de empresa](PE_04B5_ORGANIZATION_COMMERCIAL_VIEW.md) ·
[pruebas](PE_04B5_TEST_MATRIX.md).

Los nueve de PE-04B4:
[inventario de IA](PE_04B4_AI_INVENTORY.md) ·
[créditos ponderados](PE_04B4_WEIGHTED_CREDITS.md) ·
[reservas](PE_04B4_AI_RESERVATIONS.md) ·
[reloj de Free](PE_04B4_FREE_USAGE_CLOCK.md) ·
[modo consulta](PE_04B4_CONSULTATION_MODE.md) ·
[puertas comerciales](PE_04B4_COMMERCIAL_GATES.md) ·
[retirada del legacy](PE_04B4_LEGACY_LIMIT_RETIREMENT.md) ·
[privacidad](PE_04B4_PRIVACY_AND_USAGE.md) ·
[pruebas](PE_04B4_TEST_MATRIX.md).

Y fuera de PE-04, el incidente que interrumpió este tramo:
[SEC-01 · RLS de los catálogos de Quality](../security/SEC_01_RLS_INCIDENT.md).

Los siete de PE-04B3:
[inventario](PE_04B3_STORAGE_INVENTORY.md) ·
[cuota canónica](PE_04B3_CANONICAL_QUOTA.md) ·
[reservas](PE_04B3_ORGANIZATION_RESERVATIONS.md) ·
[bajar de plan](PE_04B3_DOWNGRADE_OVERLIMIT.md) ·
[reconciliación](PE_04B3_STORAGE_RECONCILIATION.md) ·
[guardia de bypass](PE_04B3_BYPASS_GUARD.md) ·
[pruebas](PE_04B3_TEST_MATRIX.md).

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

### PE-04B5 · soporte que no se puede confundir, y un catálogo administrable

Tres cosas que el producto ya no mezcla: **reportar una avería** —en los tres
planes, sin consumir nada, y disponible incluso en modo consulta o cuando el plan
no se puede resolver—, **orientación funcional** —dos casos al mes, solo Extra— y
**consultoría**, que no está en ningún plan y es Acompañamiento.

No se construyó un segundo motor de tickets: se añadió un eje, `support_kind`,
que se pregunta explícitamente. Las diez categorías existentes mezclan *de qué va*
con *qué se pide*, y deducir de ahí un derecho comercial habría sido deducirlo de
la palabra que el cliente eligió para su tema.

Y una regla que se comprueba ejecutando: **un incidente crítico de una empresa
Free va por delante de una consulta de uso de una Extra**. Pagar no te cuela
delante de una caída.

En el camino apareció que la cola de soporte enseñaba `coalesce(plan_code,
'demo')` de la suscripción heredada —la misma familia del defecto Full→Demo, que
sobrevivía ahí— y que existía una segunda puerta de escritura de tickets que no
comprobaba nada. Las dos cerradas.

La consola **Planes y uso** permite crear una revisión sucesora, editarla y
publicarla con un resumen en palabras de qué cambia; publicar **no mueve** a las
empresas ya asignadas, y mover a una es una transición explícita con motivo que
deja escrito qué tenía antes.

### PE-04B4 · dos ejes nuevos, y ninguno vigila a nadie

**Intelligence** pasa a medirse en **créditos ponderados**: una llamada al
proveedor no es un crédito, y tres operaciones pueden costar ocho. Convivían
cuatro controles sobre lo mismo —10 000 ejecuciones al mes, 500 al mes, 50 al día
**por persona**, más topes por minuto y hora— y ninguno era lo que se vende. Todos
sobreviven, reclasificados como lo que de verdad son: protección de coste y
anti-abuso. Encima queda un solo medidor comercial: 25 / 500 / 2 000 al mes por
empresa, más 50 de prueba que **se gastan primero porque caducan**.

**El tiempo de Free** son 30 minutos al día y 300 al mes **por empresa**, y el
reloj corre mientras haya una pantalla funcional abierta —se mueva el ratón o
no—. El consumo se guarda como un **conjunto de minutos**, no como una suma: tres
personas a la vez durante diez minutos consumen diez, y eso no hay que
calcularlo, sale de la clave primaria. La misma decisión que hace correcta la
aritmética es la que impide construir un panel de productividad: la tabla **no
guarda quién**.

Al agotarse, la empresa entra en **modo consulta**: sigue entrando, leyendo,
descargando y **borrando**. Lo que no puede es crear, subir ni ejecutar
Intelligence. Bloquear también el borrado la dejaría atrapada —sin poder crear y
sin poder liberar espacio—, y agotar un cupo no puede secuestrar los datos de
nadie.

Con esto **se retira el puente `free→demo`**: los límites de conteo y las
funciones habilitadas leen ya el catálogo canónico, y con ellos desaparecen
`commercialTierToLegacyPlanCode` y `resolveEffectiveStorageLimitBytes`.

### PE-04B3 · una sola cuota, y el fin del cupo doble

El inventario encontró algo que la arquitectura de PE-04A daba por bueno: **la
cuota de almacenamiento no era de la empresa, era de cada módulo**. Una empresa
Full con PCR y Textiles disponía de 500 MiB *en cada uno*, y el logo —que no
aparecía en la contabilidad que usaban esos dos módulos para decidir— no
descontaba de ninguno. Además convivían dos números de «uso» distintos para la
misma empresa: uno ignoraba las versiones históricas de TrazaDocs, las reservas
vivas y los huérfanos; el otro era completo pero por módulo.

0164 deja **una** función de uso, **una** de cuota, **un** estado y **una**
reserva, con un solo `advisory lock` por empresa. PCR, Textiles y el logo
compiten por el mismo cupo, y está demostrado ejecutando el camino real:
`begin_textile_evidence_upload_v2` rechaza una carga por bytes que ocupó PCR.

Bajar de plan **no borra nada**: la empresa queda `OVER_LIMIT`, puede seguir
leyendo, descargando y borrando, y no puede subir hasta que quepa.

El puente `free→demo` de PE-04B2 salió del camino de almacenamiento. Sobreviven
dos usos, ambos de otro eje —límites de conteo y funciones habilitadas—, que se
retiran en PE-04B4.

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
| Local | **0171** |
| Staging | **0171** |
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
