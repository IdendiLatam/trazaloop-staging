# PE-06 · Lista de GO / NO-GO

*Actualizado al cerrar **PE-06B**, el 5 de septiembre de 2026.*

**El corte solo procede cuando todo lo BLOQUEANTE está en GO.** Un `PENDIENTE`
no es un `GO` pequeño: es un NO-GO con nombre.

Clases: **GO** · **NO-GO** · **PENDIENTE EXTERNO** · **PENDIENTE INTERNO** ·
**NO APLICA**.

---

## A · Código y base

| # | Puerta | Bloqueante | Estado |
|---|---|---|---|
| A1 | `test:all` en verde con código de salida 0 | sí | **GO** |
| A2 | `build` en verde | sí | **GO** |
| A3 | `typecheck` y `lint` sin errores | sí | **GO** |
| A4 | Guardián SEC-01 en verde | sí | **GO** |
| A5 | Local y Staging alineadas en 0182, sin deriva | sí | **GO** — huellas de tablas, funciones y vistas idénticas |
| A6 | Árbol de trabajo limpio y commit de salida congelado | sí | PENDIENTE INTERNO — se congela al empezar PE-06D |
| A7 | 0 tablas de `public` sin RLS | sí | **GO** (Local y Staging) |

## B · Datos de Producción

| # | Puerta | Bloqueante | Estado |
|---|---|---|---|
| B1 | Inventario de Producción en solo lectura, ejecutado | sí | **GO** — 5-sep-2026, 21:15 UTC-5 |
| B2 | `organizations` = 0 confirmado, o plan alternativo para 0163 | sí | **GO por la segunda vía** — son **3**, y 0163 se ensayó con esa forma exacta |
| B3 | Inventario de objetos de almacenamiento por cubo | sí | **GO** — 8 · 1 · 1 objetos; bytes desconocidos |
| B4 | Copia de seguridad reciente verificada | sí | **NO-GO** — `backups: []` |
| B5 | Recuperación a un punto en el tiempo | sí | **NO-GO** — `pitr_enabled: false` |

## C · Migración

| # | Puerta | Bloqueante | Estado |
|---|---|---|---|
| C1 | Las 71 migraciones clasificadas | sí | **GO** |
| C2 | Sin `drop table`, `drop column` ni borrados de datos de inquilino | sí | **GO** — un solo `delete`, de catálogo y condicionado |
| C3 | Ensayo 0112→0182 sobre base limpia, con evidencia | sí | **GO** — 71 migraciones, 0 fallos, 13 s |
| C4 | Ensayo con la forma real de Producción y con bordes | sí | **GO** — escenarios A y B, 0163 e idempotencia probados |
| C5 | Duración medida y ventana de corte acordada | sí | **PARCIAL** — 13 s medidos en local; falta acordar ventana |

## D · Configuración de Producción

| # | Puerta | Bloqueante | Estado |
|---|---|---|---|
| D1 | Variables públicas apuntan a Producción y se comprueba tras construir | sí | PENDIENTE INTERNO |
| D2 | Ninguna construcción de Preview se promueve a Producción | sí | **PENDIENTE INTERNO** — regla escrita, falta aplicarla |
| D3 | Decisión sobre `QUALITY_MODULE_ENABLED` | sí | **CERRADA** — `ENABLE_AT_CUTOVER`; falta ponerla en PE-06C/D |
| D4 | Credenciales de Intelligence, si Quality entra | condicional | PENDIENTE INTERNO |
| D5 | Retirar `MERCADOPAGO_*` de Preview | no | PENDIENTE INTERNO |
| D6 | Protección de Preview sigue activa | sí | **GO** — 401 en API, redirección a SSO en pantalla |

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
| E9 | Decisión de 3DS | sí | PENDIENTE · DECISIÓN |
| E10 | Credenciales de producción en su sitio | sí | **PENDIENTE EXTERNO** |
| E11 | Webhook de producción registrado y validado | sí | PENDIENTE INTERNO |
| E12 | Comisiones y condiciones aceptadas | no | PENDIENTE EXTERNO |

> Si E1–E11 no se cierran, **se puede salir igualmente sin cobro**: Free
> funciona, contratar falla cerrado y nadie se queda a medias.

## F · Planificador

| # | Puerta | Bloqueante para encenderlo | Estado |
|---|---|---|---|
| F1 | Ruta desplegada y fallando cerrada sin secreto | sí | **GO** en Preview; falta comprobarlo en Producción |
| F2 | Secreto de mirar puesto en Producción | sí | PENDIENTE INTERNO |
| F3 | Pasadas en seco observadas con vencimientos reales | sí | PENDIENTE INTERNO |
| F4 | Llamador externo seguro configurado | sí | PENDIENTE INTERNO |
| F5 | Aviso activo ante `provider_unknown` | sí | **NO-GO** — no existe |
| F6 | Interruptor, secreto de ejecución y lista blanca | sí | apagados a propósito |

## G · Impuestos y legal

| # | Puerta | Bloqueante | Estado |
|---|---|---|---|
| G1 | Confirmación contable del 19 % | sí | **PENDIENTE EXTERNO** |
| G2 | Redacción legal y fiscal revisada | sí | PENDIENTE INTERNO |
| G3 | Estado ante MinTIC, si se persigue la exención | no | PENDIENTE EXTERNO |

## H · Identidades

| # | Puerta | Bloqueante | Estado |
|---|---|---|---|
| H1 | Superadministración humana verificada en Producción | sí | PENDIENTE INTERNO |
| H2 | Identidades de QA inventariadas | sí | PENDIENTE INTERNO |
| H3 | Desactivación planificada, **sin borrar** y conservando atribución | sí | PENDIENTE INTERNO |

## I · Comercial

| # | Puerta | Bloqueante | Estado |
|---|---|---|---|
| I1 | Tipo de cambio fijado tras desplegar | sí para vender | PENDIENTE INTERNO |
| I2 | Catálogo con sus cifras congeladas | sí | **GO** — 0/0, 4000/40000, 10000/100000 |
| I3 | Regla fiscal vigente al 19 % | sí | **GO** |
| I4 | Prueba de 48 h y 50 créditos | sí | **GO** |

## J · Prueba humana

| # | Puerta | Bloqueante | Estado |
|---|---|---|---|
| J1 | Humo humano en Preview aceptado | sí | **GO** — «se entiende y me gusta» |
| J2 | Humo humano en Producción tras el corte | sí | PENDIENTE INTERNO — PE-06E |

---

## Resumen

| | |
|---|---|
| **GO** | 17 |
| **NO-GO** | 3 · **copia de seguridad (B4)**, **PITR (B5)** y aviso ante cobro en duda (F5) |
| **PENDIENTE EXTERNO** | 11 · todas de Wompi/Gateway y contabilidad |
| **PENDIENTE INTERNO** | 14 |
| **DECISIÓN DE PRODUCTO** | 1 · 3DS |

**Veredicto: sigue siendo NO-GO**, pero por otras razones que ayer.

El ensayo de la migración **se cerró**: la cadena entera se aplicó dos veces
sobre la forma real de Producción, los guardianes se vieron parar y 0163 se probó
con sus tres modos de acceso y sus bordes.

Lo que ha empeorado es lo de las copias: **PITR está apagado y no hay copia
física listada**, y las migraciones no tienen vuelta atrás. Migrar Producción hoy
sería hacerlo sin red. Esa es ahora la puerta interna más importante, y es
barata de cerrar.
