# PE-06 · Lista de GO / NO-GO

*Estado al cerrar PE-06A, el 5 de septiembre de 2026.*

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
| B1 | Inventario de Producción en solo lectura, ejecutado | sí | **PENDIENTE INTERNO** — PE-06B |
| B2 | `organizations` = 0 confirmado, o plan alternativo para 0163 | sí | **PENDIENTE INTERNO** |
| B3 | Inventario de objetos de almacenamiento por cubo | sí | PENDIENTE INTERNO |
| B4 | Copia de seguridad reciente verificada | sí | **PENDIENTE INTERNO** — PE-06C |
| B5 | Ventana de recuperación a un punto en el tiempo conocida | sí | PENDIENTE INTERNO |

## C · Migración

| # | Puerta | Bloqueante | Estado |
|---|---|---|---|
| C1 | Las 71 migraciones clasificadas | sí | **GO** |
| C2 | Sin `drop table`, `drop column` ni borrados de datos de inquilino | sí | **GO** — un solo `delete`, de catálogo y condicionado |
| C3 | Ensayo 0112→0182 sobre base limpia, con evidencia | sí | **NO-GO** — no se ha hecho |
| C4 | Ensayo con datos parecidos a Producción | sí | **NO-GO** — depende de B1 |
| C5 | Duración medida y ventana de corte acordada | sí | PENDIENTE INTERNO |

## D · Configuración de Producción

| # | Puerta | Bloqueante | Estado |
|---|---|---|---|
| D1 | Variables públicas apuntan a Producción y se comprueba tras construir | sí | PENDIENTE INTERNO |
| D2 | Ninguna construcción de Preview se promueve a Producción | sí | **PENDIENTE INTERNO** — regla escrita, falta aplicarla |
| D3 | Decisión sobre `QUALITY_MODULE_ENABLED` | sí | **PENDIENTE · DECISIÓN DE PRODUCTO** |
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
| **GO** | 12 |
| **NO-GO** | 3 · ensayo de migración (C3, C4) y aviso ante cobro en duda (F5) |
| **PENDIENTE EXTERNO** | 11 · todas de Wompi/Gateway y contabilidad |
| **PENDIENTE INTERNO** | 19 |
| **DECISIÓN DE PRODUCTO** | 2 · Quality en Producción, y 3DS |

**Veredicto de hoy: NO-GO para el corte**, y era lo esperado. Nada de lo que
falta es trabajo pendiente de PE-05: son puertas de salida.
