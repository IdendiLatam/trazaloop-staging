# PE-05 · Lo que falta para Producción

*Escrito al cerrar PE-05, el 5 de septiembre de 2026. Producción sigue en
**0111** y no se ha tocado.*

Lo que sigue **no son tareas pendientes de PE-05**. PE-05 está funcionalmente
completo y probado en sandbox. Son **puertas de salida a Producción**: cosas que
dependen de terceros, de credenciales que no existen todavía o de decisiones
legales, y que hay que verificar **inmediatamente antes** del corte, no ahora.

---

## 1 · Wompi / Gateway · `WOMPI_GTW_PRODUCTION_ENABLEMENT_REQUIRED = YES`

Todo lo probado lo está **en sandbox**. Que el sandbox acepte un cobro recurrente
sobre una tarjeta guardada **no cierra esta puerta**: la configuración real de
producción es otra cuenta, con otro adquirente y otras reglas.

Antes del corte hay que verificar, con quien corresponda:

- afiliación al Gateway aprobada;
- adquirencia de Bancolombia activa;
- comercio electrónico / **Card Not Present** activo;
- qué procesador de tarjetas se usará realmente;
- comportamiento de **credencial almacenada (COF)** en producción;
- recurrencia de **Visa**;
- recurrencia de **Mastercard**;
- soporte de **RBM** o del procesador equivalente;
- decisión y configuración de **3DS**, y **3RI** si se adopta;
- Visa/Mastercard internacionales, si hacen falta;
- credenciales de producción;
- comisiones y condiciones comerciales de la transacción.

**Ninguna prueba de sandbox sustituye a esta verificación.**

---

## 2 · Planificador de renovaciones · `PRODUCTION_RENEWAL_SCHEDULER_NOT_CONFIGURED = YES`

El dominio de renovación está **cerrado en sandbox**: calendario, reintentos,
gracia, clases de fallo y operación. Lo que no existe es quien lo despierte en
Producción.

La ruta de ejecución tiene cinco candados apilados —secreto del corredor, secreto
de ejecución en otra cabecera, interruptor de servidor, lista blanca de
suscripciones y no estar en Producción— y **los tres últimos están apagados**.

Activarlo es trabajo de PE-06, y es un corte controlado: no se enciende «a ver
qué pasa».

---

## 3 · Impuestos y legal

Antes de publicar hay que reverificar:

- el tratamiento fiscal del arranque (hoy **19 % de IVA** en Full, Extra y
  Acompañamiento);
- la determinación contable;
- el estado de la exención de software de autoservicio ante **MinTIC**, si se
  persigue;
- los textos fiscales y legales que ve el cliente.

**La exención no está activa y no se supone.** Nada de esto reabre la
implementación de PE-05: son verificaciones externas.

---

## 4 · Datos de Producción

El dueño de producto dijo que Producción no tiene hoy información de empresas
clientes que haya que preservar. **Eso no se da por permanente.** PE-06 tiene que
volver a comprobarlo **inmediatamente antes** de migrar, contra la base real.

En este cierre **no se ha inspeccionado ni tocado Producción**.

---

## 5 · Antes de vender, una tasa

Staging **no tiene tipo de cambio vigente** ahora mismo, a propósito: las tasas
sintéticas de QA se cerraron por vigencia al terminar cada prueba.

Eso significa que **contratar, cambiar de plan y subir de plan fallan cerrado**
hasta que alguien abra una. Es el comportamiento correcto —no se inventa un
precio— pero conviene tenerlo presente: el primer paso operativo de cualquier
entorno donde se vaya a vender es **abrir una vigencia** desde
`/platform/plans → Tipo de cambio`. Las renovaciones en curso no lo necesitan.

---

## 6 · Migraciones

| Entorno | Cabecera |
|---|---|
| Local | **0182** |
| Staging | **0182** |
| Producción | **0111** |

Local y Staging están **idénticas**: mismas tablas, mismas funciones, mismas
vistas y mismas políticas, comprobado por huella de sus catálogos. Producción va
detrás **a propósito**: llevarla al día son 71 migraciones y es una decisión de
corte, no un paso de este cierre.
