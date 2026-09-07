# PE-06 · Lista de GO / NO-GO

*Actualizado al cerrar **PE-06C3**, el 6 de septiembre de 2026.*

El manual que ejecuta todo esto es
[`PE_06D_PRODUCTION_CUTOVER_RUNBOOK.md`](PE_06D_PRODUCTION_CUTOVER_RUNBOOK.md).

**El corte solo procede cuando todo lo BLOQUEANTE está resuelto.** Un pendiente
no es un LISTO pequeño: es un NO-GO con nombre — o una acción con hora y dueño.

Cuatro clases, y **no significan lo mismo**:

| Clase | Qué quiere decir |
|---|---|
| **LISTO** | hecho y verificado de este lado. No hay trabajo pendiente |
| **PENDIENTE EXTERNO** | depende de un tercero. Nadie de aquí lo puede cerrar |
| **ACCIÓN EN EL CORTE** | trabajo del operador **durante** el corte, con su paso en el manual |
| **RECOMENDACIÓN** | mejora el corte, pero no lo bloquea |

Un `NO-GO` sería una quinta clase. **No queda ninguna.**

---

## A · Código y base

| # | Puerta | Bloqueante | Estado |
|---|---|---|---|
| A1 | `test:all` en verde con código de salida 0 | sí | **LISTO** — 74 suites |
| A2 | `build` en verde | sí | **LISTO** |
| A3 | `typecheck` y `lint` sin errores | sí | **LISTO** |
| A4 | Guardián SEC-01 en verde | sí | **LISTO** |
| A5 | Local y Staging alineadas en **0183**, sin deriva | sí | **LISTO** — huellas de tablas, funciones y vistas idénticas |
| A6 | Árbol de trabajo limpio y commit de salida congelado | sí | **ACCIÓN EN EL CORTE** — fase 6 |
| A7 | 0 tablas de `public` sin RLS | sí | **LISTO** (Local y Staging) |
| A8 | Manual de corte ejecutable, no una lista vaga | sí | **LISTO** — PE-06D, 12 fases con parada y contención |
| A9 | **La batería no falla de forma intermitente** | sí | **LISTO** — PE-05B5C se puso 2 en rojo en 1 de 4 pases; la causa era la prueba, no el producto: leía el plan efectivo pasándole el reloj del anfitrión, unas décimas por detrás del reloj de la base, y un derecho recién cerrado se leía vivo. Corregido en las 10 suites que lo hacían: ahora el instante lo pone la base, como hace el producto |

## B · Datos de Producción

| # | Puerta | Bloqueante | Estado |
|---|---|---|---|
| B1 | Inventario de Producción en solo lectura, ejecutado | sí | **LISTO** — 5-sep-2026, 21:15 UTC-5 |
| B2 | `organizations` = 0 confirmado, o plan alternativo para 0163 | sí | **LISTO** — son 3, **de prueba y desechables**; se limpian antes de migrar |
| B3 | Inventario de objetos de almacenamiento por cubo | sí | **LISTO** — 8 · 1 · 1 objetos; bytes desconocidos |
| B4 | Copia de seguridad reciente verificada | **no** | **RECOMENDACIÓN** — los datos de inquilino son desechables |
| B5 | Recuperación a un punto en el tiempo | **no** | **RECOMENDACIÓN** — `pitr_enabled: false`, ya no bloquea |

### B bis · Limpieza de los inquilinos de prueba

| # | Puerta | Bloqueante | Estado |
|---|---|---|---|
| B6 | Las 3 empresas clasificadas como desechables por producto | sí | **LISTO** |
| B7 | Estado global inventariado y clasificado | sí | **LISTO** |
| B8 | Superadministración humana no depende de una empresa de prueba | sí | **LISTO** — vive en `platform_staff` |
| B9 | Grafo de dependencias medido, no adivinado | sí | **LISTO** — 98 tablas, 62 claves foráneas, 69 disparadores |
| B10 | Ensayo de limpieza + migración posterior | sí | **LISTO** — 23 filas, 0 empresas, global intacto, **72** migraciones |
| B11 | **Exportación lógica del estado global** | sí | **LISTO** — 4 artefactos verificados con huella, fuera del repositorio |
| B12 | Purga con puerta propia para Producción, sin debilitar la de Staging | sí | **LISTO** — inerte, cinco puertas probadas una a una. La herramienta deriva sus tablas del esquema, no de una lista escrita a mano |
| B14 | Recuento de Producción revalidado el día del cierre | sí | **LISTO** — 6-sep-2026: 3 empresas, 9 módulos, 4 pertenencias, 4 legales, 1 plataforma, 255 de auditoría. Sin cambios desde PE-06B |
| B15 | Lista de empresas aprobadas guardada fuera del repositorio | sí | **LISTO** — `~/trazaloop-release-artifacts/pe06c3/`, permisos 600 |
| B13 | Decisión sobre la cuenta externa sin empresa | **no** | **LISTO** — registro nunca completado: sin privilegio, sin acceso, sin datos. Se preserva |

## C · Migración

| # | Puerta | Bloqueante | Estado |
|---|---|---|---|
| C1 | Las **72** migraciones (0112 → 0183) clasificadas | sí | **LISTO** — recontadas en PE-06C3, no heredadas |
| C2 | Sin `drop table`, `drop column` ni borrados de datos de inquilino | sí | **LISTO** — un solo `delete`, de catálogo y condicionado |
| C3 | Ensayo **0112→0183** sobre base limpia, con evidencia | sí | **LISTO** — 72 migraciones, 0 fallos, dos ensayos: 25 s y 15 s |
| C4 | Ensayo con la forma real de Producción y con bordes | sí | **LISTO** — escenarios A y B; con base limpia 0163 crea **0** asignaciones |
| C5 | Duración medida y ventana de corte acordada | sí | **ACCIÓN EN EL CORTE** — 15–25 s medidos; la ventana se acuerda al fijar fecha |
| C6 | Esquema resultante verificado contra Local | sí | **LISTO** — 320 tablas y 87 vistas, **el mismo conjunto exacto** que Local en 0183, 0 sin RLS |
| C7 | **El dato de Producción cabe en el esquema que se le aplica** | sí | **LISTO** — la 0136 se paró contra 92 guías legadas; se reconciliaron y la migración terminó. Ver [`PE_06D1_MIGRATION_0136_INCIDENT.md`](PE_06D1_MIGRATION_0136_INCIDENT.md) |
| C8 | El ensayo usa el DATO real, no solo la FORMA | sí | **LISTO** — la lección de la 0136: una copia base sintética no reproduce lo que rompe. Los ensayos de reanudación parten del contenido real archivado |

## D · Configuración de Producción

| # | Puerta | Bloqueante | Estado |
|---|---|---|---|
| D1 | Variables públicas apuntan a Producción y se comprueba tras construir | sí | **LISTO** — `npm run verify:build-target`, probado en sus tres salidas |
| D2 | Ninguna construcción de Preview se promueve a Producción | sí | **LISTO** — `FRESH_PRODUCTION_TARGET_BUILD`, con guardián que lo comprueba |
| D3 | `QUALITY_MODULE_ENABLED` en Producción | sí | **ACCIÓN EN EL CORTE** — fase 7.1. Es de ejecución: no exige reconstruir |
| D4 | Credenciales de Intelligence | sí, para anunciar créditos | **ACCIÓN EN EL CORTE** — fase 7.2. `PRODUCTION_AI_DECISION = ENABLE_AT_CUTOVER` |
| D5 | Retirar `MERCADOPAGO_*` de Preview | no | **RECOMENDACIÓN** — no se toca mientras Preview se usa para verificar |
| D6 | Protección de Preview sigue activa | sí | **LISTO** — 401 en API, redirección a SSO en pantalla |
| D7 | Punto de entrega y destinatario de avisos en Producción | sí para el cobro automático | **ACCIÓN EN EL CORTE** — fase 9.2 |
| D8 | El entorno de Producción no ha sufrido regresiones | sí | **LISTO** — exactamente las 7 variables esperadas, revalidado el 6-sep-2026 |

## E · Wompi y cobro

| # | Puerta | Bloqueante | Estado |
|---|---|---|---|
| E1 | Afiliación al Gateway aprobada | sí | **PENDIENTE EXTERNO** |
| E2 | Adquirencia de Bancolombia activa | sí | **PENDIENTE EXTERNO** |
| E3 | Comercio electrónico / CNP habilitado | sí | **PENDIENTE EXTERNO** |
| E4 | Procesador real identificado | sí | **PENDIENTE EXTERNO** |
| E5 | Recurrencia Visa confirmada | sí | **PENDIENTE EXTERNO** |
| E6 | Recurrencia Mastercard confirmada | sí | **PENDIENTE EXTERNO** |
| E7 | Comportamiento de credencial almacenada (COF) confirmado | sí | **PENDIENTE EXTERNO** |
| E8 | RBM o equivalente documentado | sí | **PENDIENTE EXTERNO** |
| E9 | Decisión de 3DS | sí | **PENDIENTE EXTERNO** — la respuesta del Gateway condiciona la decisión |
| E10 | Credenciales de producción en su sitio | sí | **PENDIENTE EXTERNO** |
| E11 | Webhook de producción registrado y validado | sí | **ACCIÓN EN EL CORTE** — fase 8.2 |
| E12 | Comisiones y condiciones aceptadas | no | **PENDIENTE EXTERNO** |
| E13 | Humo de pago real en Producción, una sola transacción | sí para cobrar | **ACCIÓN EN EL CORTE** — fase 8.3, sobre una empresa de QA creada después de migrar |

> Si E1–E11 no se cierran, **se puede salir igualmente sin cobro**: Free
> funciona, contratar falla cerrado y nadie se queda a medias.

## F · Planificador

| # | Puerta | Bloqueante para encenderlo | Estado |
|---|---|---|---|
| F1 | Ruta desplegada y fallando cerrada sin secreto | sí | **LISTO** en Preview; se recomprueba en la fase 9.1 |
| F2 | Secreto de mirar puesto en Producción | sí | **ACCIÓN EN EL CORTE** — fase 9.1 |
| F3 | Pasadas en seco observadas con vencimientos reales | sí | **ACCIÓN EN EL CORTE** — fase 9.1 |
| F4 | Llamador externo seguro configurado | sí | **ACCIÓN EN EL CORTE** — fase 10. Hoy **no hay `vercel.json` y por tanto no hay cron**; se recomienda Vercel Cron, comprobando que Preview no queda encendido |
| F5 | Aviso activo ante `provider_unknown` | sí | **LISTO** — señal duradera, entrega probada, sin duplicar y sin tocar dinero |
| F6 | Interruptor, secreto de ejecución y lista blanca | sí | **ACCIÓN EN EL CORTE** — fase 10, y solo tras 8, 9 y el humo de avisos |

## G · Impuestos y legal

| # | Puerta | Bloqueante | Estado |
|---|---|---|---|
| G1 | Confirmación contable del 19 % | sí | **PENDIENTE EXTERNO** |
| G2 | Redacción legal y fiscal revisada | sí | **ACCIÓN EN EL CORTE** — fase 7.4 |
| G3 | Estado ante MinTIC, si se persigue la exención | no | **RECOMENDACIÓN** |

## H · Identidades

| # | Puerta | Bloqueante | Estado |
|---|---|---|---|
| H1 | Superadministración humana verificada en Producción | sí | **ACCIÓN EN EL CORTE** — fase 11 |
| H2 | Identidades de QA inventariadas | sí | **ACCIÓN EN EL CORTE** — fase 11 |
| H3 | Desactivación planificada, **sin borrar** y conservando atribución | sí | **ACCIÓN EN EL CORTE** — fase 11 |

## I · Comercial

| # | Puerta | Bloqueante | Estado |
|---|---|---|---|
| I1 | Tipo de cambio fijado tras desplegar | sí para vender | **ACCIÓN EN EL CORTE** — fase 7.3. **La cifra la decide producto en el corte**; no está escrita en el código ni en el manual |
| I2 | Catálogo con sus cifras congeladas | sí | **LISTO** — 0/0, 4000/40000, 10000/100000 |
| I3 | Regla fiscal vigente al 19 % | sí | **LISTO** |
| I4 | Prueba de 48 h y 50 créditos | sí | **LISTO** |

## J · Prueba humana

| # | Puerta | Bloqueante | Estado |
|---|---|---|---|
| J1 | Humo humano en Preview aceptado | sí | **LISTO** — «se entiende y me gusta» |
| J2 | Humo humano en Producción tras el corte | sí | **ACCIÓN EN EL CORTE** — fase 11 |

---

## Resumen

68 puertas, en cuatro clases:

| Clase | Cuántas | Qué significa |
|---|---|---|
| **LISTO** | **35** | trabajo terminado y verificado de este lado |
| **ACCIÓN EN EL CORTE** | **17** | del operador, cada una con su fase en PE-06D |
| **PENDIENTE EXTERNO** | **12** | Gateway de Wompi y verificación contable |
| **RECOMENDACIÓN** | **4** | mejoran, no bloquean |
| **NO-GO** | **0** | — |

### Recomendación

**`PLATFORM_DEPLOY_ALLOWED` — se puede.** Todo lo que depende de este lado está
LISTO: la base migra en menos de medio minuto con 72 migraciones y 0 fallos, la limpieza tiene sus
cinco puertas probadas, el artefacto no puede salir apuntando al proyecto
equivocado, y el manual dice qué hacer paso a paso, incluido cuándo parar.

**`COMMERCIAL_PAYMENTS_ALLOWED` — todavía no.** Las doce puertas externas son
todas de Wompi y de contabilidad. Ninguna se cierra escribiendo código.

**Y no son lo mismo.** El producto puede salir a Producción hoy con Free
funcionando y contratar fallando cerrado — exactamente lo que ya hace sin
credenciales del proveedor. Lo que **no** puede hacerse es anunciar cobro antes
de tener con qué cobrar.

Las 17 acciones del corte no son deuda de producto: son poner variables, fijar el
tipo de cambio, registrar el webhook y encender el planificador **en su orden**.
Están en el manual, con su parada y su contención.
