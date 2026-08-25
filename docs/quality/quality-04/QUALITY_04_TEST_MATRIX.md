# QUALITY-04 · Matriz de pruebas

**63 comprobaciones propias**, más la regresión completa. Todas con **código de
salida real**, leído explícitamente.

| Suite | Qué demuestra | Local | Staging |
|---|---|---|---|
| `test:quality04` — puras y estáticas | el dominio y la migración dicen lo mismo | **30 ✔** | **30 ✔** |
| `test:quality04-rls` — base real | el ciclo completo bajo RLS, con sesiones reales | **33 ✔** | **33 ✔** |

## 1. Base real · 33

### A · Señal ≠ caso ≠ no conformidad (5)

| | |
|---|---|
| `A1` | un indicador con 82 frente a meta 95 **no crea ninguna NC ni ningún caso** |
| `A2` | el usuario crea el caso desde la señal; el caso la **referencia** y no copia el dato |
| `A3` | evaluarlo como observación deja el contador de NC en **cero** |
| `A4` | una referencia a algo de **otra empresa** se rechaza |
| `A5` | una referencia a algo **inexistente** se rechaza |

### B · El ciclo completo de una no conformidad (18)

| | |
|---|---|
| `B1` | sin hallazgo no se puede clasificar |
| `B2` | una NC exige requisito e incumplimiento **separados** |
| `B3` | formalizarla registra la decisión con su fundamento, y el contador sube a **1** |
| `B4` | una decisión formal **no se edita ni se borra** (AC-22) |
| `B5` | el caso **no se cierra** con el ciclo a medias, y dice qué falta (AC-18) |
| `B6` | hipótesis ≠ causa validada (AC-10) |
| `B7` | aprobar la causa la vuelve historia y ya no se reescribe |
| `B8` | corrección y acción correctiva son **dos cosas** (AC-05) |
| `B9` | exigir eficacia **sin criterio previo** es imposible (AC-16) |
| `B10` | **completada no es eficaz**: queda pendiente y sin cerrar (AC-13) |
| `B11` | tampoco se cierra el caso con una eficacia pendiente |
| `B12` | una eficacia **negativa** conserva todo y devuelve el caso a análisis (AC-17) |
| `B13` | «no eficaz» **no se convierte** en «eficaz» con un UPDATE |
| `B14` | tras una eficacia negativa se planifica **otra** acción, sin borrar la anterior |
| `B15` | ahora sí se puede cerrar, y el cierre exige fundamento |
| `B16` | un caso cerrado **no se edita** por la puerta de atrás |
| `B17` | reabrir exige motivo y **conserva el cierre anterior** (AC-19) |
| `B18` | el historial contiene clasificación, causa, cierre y reapertura |

### C · Tareas y vencimientos (2)

`C1` una acción vencida produce evento y alerta **para el titular del cargo** ·
`C2` repetir el barrido **no duplica** nada (AC-23).

### X · Ataques y aislamiento (8)

`X1` fabricar una decisión · `X2` fabricar una verificación · `X3` un consultor
clasificando o verificando · `X4` un consultor reabriendo · `X5` ver algo de
otra empresa · `X6` clasificar, cerrar, completar o barrer en otra empresa ·
`X7` reciclar el número de un caso eliminado · `X8` borrar un caso con
decisiones o una acción verificada. **Todos rechazados.**

## 2. Puras y estáticas · 30

**A · Las separaciones del dominio (7)** — clasificación y estado no comparten
ningún valor; «sin evaluar» no se puede elegir; los cuatro tipos de acción se
explican por lo que **hacen** y corrección/correctiva no comparten explicación;
completada≠eficaz en las cuatro combinaciones; el vencimiento se cuenta con el
signo correcto; solo está vencido lo que aún no se hizo.

**B · Permisos, historial y enlaces (7)** — registrar es trabajo y gobernar es
otra cosa; el historial se cuenta en español y en pasado; un dictamen ilegible
se lee como «no se cierra»; una referencia solo enlaza donde hay página; la
bandeja conoce los tipos nuevos y una tarea de caso lleva **a su caso**; los
avisos de frontera no mienten; cada tipo de caso tiene nombre propio.

**M · Migración 0121 (12)** — append-only; **no crea un sistema paralelo de
alertas**; el motor de acciones es uno solo; la referencia tipada se valida de
verdad; las decisiones son inmutables; el cierre se **condiciona** y es
proporcional; una eficacia negativa devuelve el caso a análisis sin borrar la
acción; el criterio se exige antes; la historia es de solo lectura para el
cliente; una NC formalizada no se elimina; el número no se recicla; la migración
ancla AC-01, AC-02, AC-04, AC-05, AC-13, AC-16, AC-17, AC-22 y MDR-33.

**N · Coherencia entre capas (4)** — los enumerados del dominio y los de la
**base** coinciden; las server actions **no deciden** nada por su cuenta y
siempre pasan por su RPC; la pantalla obedece al dictamen de cierre y redacta la
NC en tres campos; la ficha se lee como una historia con sus seis etapas.

## 3. Regresión

### Local

```
npm run test:all   →  EXIT 0   ·  1 999 comprobaciones
```

Cubre QUALITY-01, 01.1, 01.2, 02, 03, 03.1, **04**, el hotfix de acceso por
módulo, PCR, Textiles, TrazaDocs, Auth, equipo/invitaciones, selector de
módulos, release v1.0.x y recuperación de contraseña.

| Suite de base real | ✔ |
|---|---|
| QUALITY-01 | 56 |
| QUALITY-01.1 | 41 |
| QUALITY-01.2 | 33 |
| QUALITY-02 | 58 |
| QUALITY-03 | 52 |
| QUALITY-03.1 | 30 |
| QUALITY-03.1a | 11 |
| **QUALITY-04** | **33** |
| **total** | **314** |

### Staging

Las mismas ocho suites: **302 ✔** (las de QUALITY-01.x muestran menos porque
omiten —y lo anuncian— las que necesitan SQL directo sin `SUPABASE_DB_URL`).
Todas con exit 0.

## 4. Lo que las pruebas encontraron

| Hallazgo | Dónde | Corrección |
|---|---|---|
| **Faltaba la guarda de borrado: una NC formalizada se podía destruir** | `X8`, base real | §18 de 0121, con el patrón de QUALITY-03.1 |
| El titular del cargo no recibía la alerta | `C1` | era orden en la prueba: la membresía debe ir antes de la asignación |
| `M2` daba falso positivo | suite pura | la migración **nombra** las tablas prohibidas para explicar que no las crea; se comparan sin comentarios |

El primero es un defecto real que introduje y que la suite cazó antes de llegar
a Staging: `work_decisions.subject_id` es genérico y por eso no tiene FK al
caso, así que nada impedía dejar el acta huérfana.
