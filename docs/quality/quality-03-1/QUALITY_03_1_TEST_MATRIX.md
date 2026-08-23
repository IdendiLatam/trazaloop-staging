# QUALITY-03.1 · Matriz de pruebas

**63 comprobaciones propias**, más la regresión completa. Todas con **código de
salida real**, leído explícitamente.

| Suite | Qué demuestra | Local | Staging |
|---|---|---|---|
| `test:quality031` — puras y estáticas | el PDF, el dominio del ciclo de vida y la migración | **33 ✔** | **33 ✔** |
| `test:quality031-rls` — base real | el tiempo y el ciclo de vida bajo RLS, con sesiones reales | **30 ✔** | **30 ✔** |

## 1. Puras y estáticas · 33

### P · Identidad de empresa en el PDF (12)

`P1` un PNG con transparencia llega al PDF con su máscara · `P2` un PNG sin
alfa no inventa una máscara · `P3` un JPEG se incrusta tal cual, sin
recomprimir · `P4` lo que no se puede incrustar se rechaza **sin romper**
—WebP, archivo vacío, basura— y devuelve un mensaje, no una excepción · `P5`
hay tope de tamaño y de píxeles, comprobado antes de descomprimir · `P6` el
logo se encaja sin deformarse y nunca se agranda · `P7` el PDF del documento
incrusta el logo **de verdad** · `P8` y sigue llevando la identidad documental
completa · `P9` **sin logo el PDF sale igual**, con el nombre de la empresa y
sin dejar un hueco · `P10` la Lista Maestra comparte la misma identidad · `P11`
el logo viaja **una vez** aunque aparezca en varias páginas · `P12` el
generador **no acepta URL**: solo bytes ya obtenidos.

### D · Ciclo de vida (11)

`D1` un dictamen ilegible se interpreta como **no se borra** —un fallo de
lectura no puede convertirse en permiso— · `D2` un dictamen válido se lee
entero · `D3` las entradas mal formadas se descartan sin romper · `D4` el
motivo se cuenta como lo diría una persona · `D5` el mensaje dice el porqué
**con números** y la salida, nunca «No se puede eliminar» a secas · `D6` la
confirmación **nombra** el objeto · `D7` la ayuda de un objeto desechable **no
contiene la palabra «nunca»** · `D8` los avisos de frontera se dan **antes** de
cruzarla · `D9` cada entidad tiene nombre y ayuda propias, sin texto genérico
compartido · `D10` la pantalla **no decide**: el dictamen llega resuelto, y la
página del documento dejó de recalcular la regla por su lado · `D11` la
eliminación pasa por el servidor, y un borrado de cero filas no se reporta como
éxito.

### M · Migración 0119 (10)

`M1` append-only, no toca lo anterior · `M2` la elegibilidad temporal se define
**una sola vez** y se consulta al menos cuatro veces · `M3` la vista ya no
puede fabricar un periodo anterior a la vigencia · **`M4` el barrido conserva
su comportamiento y solo cambia UNA línea** · `M5` la frontera histórica de un
indicador no es tener configuración · `M6` el dictamen y la puerta usan la
misma función · `M7` el despachador enmascara por completo lo ajeno · `M8`
D-04: el código se reserva y no se recicla, sin documentos fantasma · `M9` el
privilegio que el entorno concede de más queda retirado · `M10` la migración
explica el porqué y ancla D-04, D-20, OI-07, OI-24, OI-28 y MDR-49.

> **`M4` merece un párrafo.** La primera versión del barrido se reescribió de
> memoria y perdió el estado de las alertas y la clave de deduplicación. La
> suite de base real lo cazó. `M4` compara el cuerpo actual con el de 0117 y
> exige que difieran en **exactamente una línea**, la de elegibilidad.

## 2. Base real · 30 · local y Staging

Con sesiones reales de usuarios reales. `service_role` se usa **solo** para
crear cuentas.

### T · Semántica temporal (12)

| | |
|---|---|
| `T1` | un indicador que empieza este mes **no pide el mes anterior** |
| `T2` | y sí reconoce el periodo en curso como suyo |
| `T3` | **la vista y el motor dicen lo mismo** — el defecto entero en una comprobación |
| `T4` | vigencia a mitad de periodo: el periodo es suyo y se puede medir; el anterior no |
| `T5` | trimestral que empieza en el trimestre en curso no retrocede |
| `T6` | anual que empieza este año no pide el año pasado |
| `T7` | un indicador **antiguo sí conserva** su periodo pendiente |
| `T8` | el barrido no crea tarea, alerta **ni hecho en la bitácora** pre-vigencia |
| `T9` | repetir el barrido sigue siendo idempotente |
| `T10` | cero sigue siendo un dato y se evalúa |
| `T11` | cambiar la meta sigue sin reescribir el pasado |
| `T12` | una empresa ajena no ve el estado de un indicador de otra |

`T7`, `T10` y `T11` existen para probar que la corrección **no apagó** lo que
funcionaba: es fácil cambiar un defecto por otro.

### L · Ciclo de vida (18)

| | |
|---|---|
| `L1` | cargo sin nada asociado → se elimina |
| `L2` | cargo en uso → no se elimina, el motivo dice cuántos, ofrece desactivar |
| `L3` | indicador sin resultados → se elimina |
| `L4` | **indicador con medición → no se elimina, ni por un administrador**, y la medición sigue ahí |
| `L5` | retirarlo sí se puede y conserva el histórico |
| `L6` | una medición no se borra por PostgREST |
| `L7` | objetivo en borrador sin resultados → se elimina |
| `L8` | objetivo ya activo → no se elimina |
| `L9` | documento en borrador → se elimina |
| `L10` | **D-04: el código del borrador eliminado no se recicla**, y el motivo lo explica |
| `L11` | dos documentos vivos no comparten código |
| `L12` | la reserva es por empresa, no global |
| `L13` | una decisión de workflow no se borra (D-20) |
| `L14` | un cierre de periodo no se borra |
| `L15` | una empresa ajena no averigua nada: ni motivo ni contadores |
| `L16` | una empresa ajena no puede eliminar |
| `L17` | **el servidor vuelve a comprobar en el instante del borrado** |
| `L18` | retirar conserva el histórico y sigue siendo consultable |

## 3. Verificación real del PDF

No se aceptó un `HTTP 200`. Descargado **desde la interfaz** y comprobado sobre
el archivo: `%PDF-1.7`, 1 página, 2 objetos de imagen (logo + máscara), la
página lo referencia, el operador de dibujo está, y contiene el nombre de la
empresa, el código, el título y la revisión. Renderizado para verlo. Lo mismo
con la Lista Maestra. Y el respaldo sin logo, comprobado de extremo a extremo.

Detalle en `QUALITY_03_1_PDF_IDENTITY.md` §6 y §7.

## 4. Regresión

### 4.1 · Local

```
npm run test:all   →  EXIT 0   ·  1 965 comprobaciones
```

Cubre QUALITY-01, 01.1, 01.2, 02, 03, **03.1**, el hotfix de acceso por módulo,
PCR, Textiles, TrazaDocs, Auth, equipo/invitaciones, selector de módulos,
release v1.0.x y recuperación de contraseña.

| | base real | recorrido |
|---|---|---|
| QUALITY-01 | 56 ✔ | 15 ✔ |
| QUALITY-01.1 | 41 ✔ | 16 ✔ |
| QUALITY-01.2 | 33 ✔ | 16 ✔ |
| QUALITY-02 | 58 ✔ | 26 ✔ |
| QUALITY-03 | 52 ✔ | 17 ✔ |
| QUALITY-03.1 | 30 ✔ | — |
| **total** | **270 ✔** | **90 ✔** |

Más `test:module-access-isolation` → 17 ✔. Todas con exit 0.

### 4.2 · Staging

| | base real | recorrido |
|---|---|---|
| QUALITY-01 | 51 ✔ | 15 ✔ |
| QUALITY-01.1 | 37 ✔ | 16 ✔ |
| QUALITY-01.2 | 30 ✔ | 16 ✔ |
| QUALITY-02 | 58 ✔ | 26 ✔ |
| QUALITY-03 | 52 ✔ | 17 ✔ |
| QUALITY-03.1 | 30 ✔ | — |
| **total** | **258 ✔** | **90 ✔** |

Más `test:quality031` (33 ✔) y `test:module-access-isolation` (17 ✔). Todas con
exit 0.

> Las tres suites de QUALITY-01.x muestran menos comprobaciones en Staging
> porque **omiten** —y lo anuncian— las que necesitan SQL directo cuando no se
> define `SUPABASE_DB_URL`.

## 5. Lo que las pruebas encontraron y no se dejó pasar

| Hallazgo | Dónde apareció | Corrección |
|---|---|---|
| El barrido reescrito perdía el estado de las alertas y la clave de deduplicación | suite de base real | reconstruido desde 0117, cambiando una línea; `M4` lo fija |
| `1 metas históricas` — concordancia rota | revisión del dictamen | plural condicionado a la cuenta |
| `Tiene 1 salió del borrador (estado «in_review»)` — no concuerda y muestra un código interno | **navegador** | el estado va en el motivo, en español |
| `removeQualityPosition` solo contemplaba `23503` y el disparador responde `P0001` antes | suites de QUALITY-01.1 | el repliegue contempla las dos barreras |
| El diálogo del cargo prometía eliminar contando 2 de 5 referencias | auditoría del modelo | usa el dictamen del servidor |
| 0119 no estaba en las listas blancas de migraciones | `test:all` | registrada en 17 archivos |

Las dos primeras las introduje yo en este mismo sprint; las tres siguientes
eran defectos reales del código anterior.
