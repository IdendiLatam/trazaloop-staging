# PE-06B · El ensayo de la migración

*5 de septiembre de 2026. Cuatro bases desechables, ninguna de ellas Producción.*

---

## Por qué hacía falta

Local y Staging llegaron a 0182 **migración a migración**, a lo largo de meses.
Producción daría **71 de golpe** desde 0111. Que las dos primeras funcionen no
demuestra que el salto funcione: demuestra que cada paso funcionó cuando le tocó.

Y desde que sabemos que Producción tiene **tres empresas con datos reales**, 0163
dejó de ser una migración que no hace nada.

---

## Cómo se montó el banco de pruebas

Bases desechables en el clúster local de Postgres, con nombres inequívocos:
`pe06b_ensayo_a`, `_b`, `_c`, `pe06b_limpia`.

La infraestructura de Supabase —esquemas `auth`, `storage`, `extensions`,
`vault`— se **copió del stack local**, no se aproximó a mano. Encima se aplicó
la cadena real **0001 → 0111**:

```
0001 → 0111 :  103 migraciones · 0 fallos · 12 s
```

Y la base resultante se comprobó contra lo que el inventario vio en Producción:
`quality.is_functional = false`, sin tablas de PE-04 ni PE-05, sin FAQ, sin
Quality, con `organization_subscriptions` presente. **Coincide.**

*Detalle que costó un intento:* cada migración se aplica **en una sola
transacción**, como hace el corredor de Supabase. Sin eso, 0105 falla porque un
`LOCK TABLE` no puede correr fuera de un bloque. No es un defecto de la
migración: era de mi banco de pruebas.

---

## Escenario A · la forma exacta de Producción

Fixture sintético que reproduce lo que se inventarió —**ni un dato de cliente
copiado, solo la forma**—: 3 empresas, 6 personas, 4 pertenencias, 9 filas de
módulo con `core` full ×3 y `textiles`/`traceability_6632` en `demo`, `extra` y
`full`, suscripción heredada en `demo`, y la metodología de reciclado con **3
cálculos apuntándola**.

```
0112 → 0182 :  71 migraciones · 0 fallos · 12 s
```

Las cinco más lentas, todas de Quality: 0133 (373 ms), 0127 (361), 0128 (333),
0132 (286), 0123 (285).

---

## Escenario B · los bordes que Producción no tiene

Producción ejercita los tres modos de acceso, así que el escenario A ya los
cubre. Lo que no tiene son los bordes, y son los que romperían callados:

```
0112 → 0182 :  71 migraciones · 0 fallos · 12 s
```

| Borde | Qué hizo 0163 |
|---|---|
| Empresa **sin módulos funcionales** | **ninguna asignación** |
| Módulo **deshabilitado** (`enabled = false`) | base Free **+ vendido Full** |
| Módulo con acceso **caducado** | **solo** base Free — el ensayo caducado no revive |
| Módulo `quality`, funcional desde 0112 | base Free + vendido Full |

**Lo del módulo deshabilitado conviene tenerlo claro.** 0163 recorre los módulos
funcionales sin mirar `enabled`, así que a un módulo apagado le crea igualmente
su nivel comprado. No expone nada —la visibilidad la sigue gobernando
`organization_modules.enabled`— y registra lo que se contrató, que es lo que una
asignación debe decir. Además **Producción no tiene ningún módulo funcional
deshabilitado**, así que hoy no ocurre. Se deja anotado, no se cambia.

---

## 0163, leído por lo que hace

El mapeo **no se inventó**: se leyó del resultado.

| `access_mode` | Asignaciones creadas |
|---|---|
| `demo` | base **Free** permanente + **prueba Full** con caducidad |
| `full` | base **Free** + **vendido Full** |
| `extra` | base **Free** + **vendido Extra** |

Cada empresa recibe su suelo Free permanente por módulo funcional, y encima el
nivel que le corresponda. **Ninguna empresa quedó con dos niveles vendidos vivos
en el mismo módulo.**

### Idempotencia

Volver a correr la migración comercial, en los dos escenarios:

```
{"paid": 0, "trials": 0, "free_bases": 0}
asignaciones antes: 12 → después: 12       (escenario A)
asignaciones antes: 17 → después: 17       (escenario B)
```

No duplica nada.

---

## 0147 · el único borrado de la cadena

Producción tiene **una** metodología con **tres** cálculos apuntándola. El ensayo
reprodujo exactamente eso:

```
antes : RC-6632-15343 v1, activa, referenciada por 3
después: RC-6632-15343 v1, INACTIVA, referenciada por 3   ← no se borra
         RC-6632-15343 v2, activa,   referenciada por 0   ← la canónica nueva
```

Los tres cálculos quedaron **intactos**. La condición B documentada —«en una base
con cálculos apuntándola, la fila se queda»— se cumple. **No hay pérdida de
historia.**

---

## Los rellenos acotados

| Migración | Sobre qué | En el ensayo |
|---|---|---|
| 0134 | `quality_ai_runs` | 0 filas · la tabla nace vacía |
| 0153 | plantillas de automatización | 26 sembradas |
| 0156 | `legal_documents` | 2 en el ensayo · **Producción tiene 4** |
| 0164 | `storage_upload_intents` | 9 pendientes, conservadas |
| 0181 | ancla de suscripciones | 0 · no hay suscripciones a 0182 recién migrado |
| 0182 | identidad de obligaciones | 0 · idem |

0181 y 0182 quedan **estructuralmente ejercitadas y funcionalmente vacías**: sin
suscripciones no hay nada que rellenar. Es el resultado correcto, y conviene
decirlo así en vez de presentarlo como una prueba de que rellenan bien —eso ya lo
prueban sus propias suites.

---

## Los guardianes, vistos parar

### La RLS

Se apagó **a propósito** la RLS de `organizations` en una base desechable y se
intentó seguir migrando:

```
0166 → salida 3
ERROR: SEC01_RLS_PREFLIGHT: hay tablas de public sin RLS: public.organizations
```

Restaurada la RLS, la misma migración → salida **0**. El guardián para, y para
por lo que dice que para.

### Las precondiciones

Aplicadas fuera de orden sobre una base a 0111:

| Migración | Salida | Mensaje |
|---|---|---|
| 0182 | 3 | «presupone 0169, 0172, 0179 y 0181» |
| 0181 | 3 | «presupone 0172, 0174, 0175 y 0178» |
| 0174 | 3 | «presupone 0173» |

Ninguna sigue en silencio.

---

## La pasada limpia

Sin corrupción deliberada, sobre una base a 0111 con la forma de Producción:

```
0112 → 0182
71 migraciones · 0 fallos · 13 s de reloj de pared
405 tablas en `public`
0 intervenciones manuales
```

---

## Comparación con Staging

| | Ensayo | Staging | Local |
|---|---|---|---|
| Tablas | `84d185b7…` | `84d185b7…` | `84d185b7…` |
| Vistas | `d02ad68d…` | `d02ad68d…` | `d02ad68d…` |
| Funciones | `177792c6…` | `5240cd1d…` | `5240cd1d…` |

Tablas y vistas: **idénticas**. Las funciones difieren en **36**, y la diferencia
está explicada del todo:

- funciones de Staging **ausentes** en el ensayo: **0**;
- funciones de más en el ensayo: 36, **todas de `pgcrypto`**.

En el ensayo `pgcrypto` quedó instalado en `public`; en Staging vive en
`extensions`. Es un artefacto de cómo monté la base desechable, no de la cadena.
Producción es un proyecto gestionado por Supabase igual que Staging, así que
tendrá `extensions` poblado y no reproducirá esta diferencia.

---

## Seguridad después de migrar

Sobre la base del ensayo, ya en 0182:

```
tablas de public sin RLS : 0
políticas                : 693     (iguales que Staging)
vistas                   : 86      (iguales que Staging)
```

---

## Qué queda sin probar, y se dice

- **Las suites de aplicación no corrieron contra la base del ensayo.** Necesitan
  PostgREST y `auth` apuntando a ella, y montar un segundo stack para eso habría
  desestabilizado el entorno local. Corrieron contra Local, que llegó a 0182 por
  **la misma cadena**. Es una limitación real del banco de pruebas, no un
  resultado.
- **Bytes agregados de almacenamiento en Producción**: desconocidos.
- **Copia de seguridad de Producción**: `pitr_enabled = false` y sin copias
  físicas listadas. No cierra; empeora.

---

## Veredicto

```
MIGRATION_REHEARSAL_NOT_PERFORMED = NO
PRODUCTION_DATA_BASELINE_UNVERIFIED = NO
PRODUCTION_DATA_RECHECK_REQUIRED_AT_CUTOVER = YES
MIGRATION_0163_ACTUAL_DATA_REHEARSAL_REQUIRED = HECHO
```

Las bases desechables se destruyeron al terminar.
