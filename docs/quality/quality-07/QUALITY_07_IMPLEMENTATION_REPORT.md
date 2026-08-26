# QUALITY-07 · Informe de implantación

**Sprint:** proveedores, criticidad, evaluación y reevaluación
**Rama:** `feature/quality-07-suppliers-evaluation`
**Línea base:** `baseline/quality-06-post-acceptance` = `72c53ee`
**Migración:** `0125_quality_suppliers_evaluation.sql` — Local ✔ · Staging ✔ · Production ✘ (intencional)

---

## 1 · Qué se construyó

El dominio transversal de proveedores del sistema de gestión, conservando las
nueve separaciones que lo hacen útil:

> **PROVEEDOR ≠ SEDE ≠ CATEGORÍA ≠ CRITICIDAD ≠ REQUISITO ≠ EVALUACIÓN ≠
> DESEMPEÑO ≠ DECISIÓN ≠ ACCIÓN**

| Capa | Qué hay |
|---|---|
| Esquema | 21 tablas · 3 vistas · 18 funciones · 39 políticas RLS · 62 disparadores |
| Dominio | `lib/domain/quality-suppliers.ts` — 504 líneas, puro |
| Datos | `lib/db/quality-suppliers.ts` — 1 550 líneas, con cliente inyectable |
| Acciones | `server/actions/quality-suppliers.ts` — 27 acciones, todas por el guard |
| Pantallas | 10 componentes · 8 rutas bajo `/quality/suppliers` |
| Papel | 13 exportaciones nuevas |
| Pruebas | 68 puras + 48 contra base real |

## 2 · Las cuatro decisiones que definieron el sprint

**La identidad del proveedor es transversal, y PCR y Textiles apuntan a ella.**
Crear una tercera tabla de proveedores habría dado el resultado predecible: la
misma empresa tres veces y una persona sincronizándolas a mano. El puente es una
columna nueva y **opcional** en cada módulo, así que ninguno cambia de
comportamiento y ninguna fila existente se tocó.

**La unidad de decisión es el ALCANCE, no el proveedor.** Nadie pregunta «¿ACME
está aprobado?»; pregunta si puede comprarle *esa* categoría en *esa* sede. Por
eso no existe ninguna columna `is_approved` en el proveedor, y las tres tablas
que representan actos —criticidad, evaluación, decisión— llevan `scope_id not
null`.

**La criticidad reutiliza el motor de metodologías de QUALITY-05.** Ensanchar
`applies_to` en vez de escribir un segundo motor trajo gratis el versionado, la
derivación con su rastro y —lo que importaba— la cadencia de revisión de la
banda de resultado, con lo que GP-20 se cumple sin una sola columna nueva.

**La evaluación informa; la decisión es humana.** `scoreApproves()` devuelve
`false` siempre y existe para que una prueba pueda comprobarlo. La RPC de cierre
devuelve `decides_nothing: true`, y ese hecho llega literalmente hasta el
mensaje que ve quien cierra.

## 3 · Lo que este módulo NO es

- **No es un ERP de compras.** Sin pedidos, líneas, precios, facturas ni
  importes. Dos pruebas fallan si aparece cualquiera de esas palabras.
- **No duplica proveedores.** Ni entre módulos, ni al incorporar dos veces, ni
  al adoptar el mismo ACME desde dos sitios.
- **No homologa a nadie por su puntuación.** Un 92 es un 92.
- **No suspende por vencimiento.** Una revisión vencida o un certificado
  caducado avisan; la aprobación no se mueve.
- **No convierte un incidente en no conformidad.** Abre un caso SIN clasificar,
  y clasificarlo sigue siendo la decisión de siempre.
- **No crea motores propios.** Tareas, alertas, acciones, casos, decisiones y
  referencias son los transversales, ensanchados de forma aditiva.
- **No guarda datos personales** que la relación comercial no necesite.

## 4 · Los defectos que encontraron las pruebas

Cinco, todos corregidos **antes** de aplicar 0125 a Staging. Los dos primeros
son de fondo:

1. **Una evaluación cerrada se podía reescribir** con un `update` normal. La
   línea de evolución se habría movido sin que nadie evaluara otra vez.
   Corregido con dos disparadores.
2. **Los factores de criticidad se escribían con la dimensión en blanco**: la
   RPC leía los identificadores de un rastro que no los lleva. Corregido
   escribiéndolos desde los niveles elegidos.

Los tres restantes —el alcance de metodología que TypeScript no conocía, la
nomenclatura de la ASL y tres exportaciones sin botón— están en
`QUALITY_07_TEST_MATRIX.md` §5, junto con tres defectos de las propias pruebas
cuya corrección no relajó ninguna afirmación.

## 5 · Los 111 criterios

### A · Línea base y rama

| # | Criterio | Veredicto | Evidencia |
|---|---|---|---|
| 1 | La línea base se resolvió desde Git, no desde el enunciado: `baseline/quality-06-post-acceptance` = `72c53ee`, el HEAD real de QUALITY-06.1 | **PASS** | `git rev-parse` contra el tag y contra la rama |
| 2 | Rama `feature/quality-07-suppliers-evaluation` creada desde esa línea base | **PASS** | `git log --oneline` |
| 3 | Ninguna migración anterior editada · ningún `migration repair` · ningún force push | **PASS** | prueba P1 · `migration list` sin desalineadas |

### B · Descubrimiento antes del esquema

| # | Criterio | Veredicto | Evidencia |
|---|---|---|---|
| 4 | Se inventariaron los proveedores que ya existían —`suppliers` de PCR y `textile_suppliers` de Textiles— antes de escribir una línea de esquema | **PASS** | `QUALITY_07_SUPPLIER_IDENTITY.md` §1 |
| 5 | Se decidió reutilizar la identidad empresarial en vez de crear una tercera tabla de proveedores | **PASS** | `QUALITY_07_SUPPLIER_IDENTITY.md` §2 |

### C · Identidad transversal (GP-02, MDR-11)

| # | Criterio | Veredicto | Evidencia |
|---|---|---|---|
| 6 | `quality_external_parties` es la empresa externa, no «el proveedor» | **PASS** | prueba A1 |
| 7 | `quality_external_party_roles` declara qué es para nosotros: proveedor, cliente, laboratorio… | **PASS** | prueba A1 |
| 8 | Sedes y contactos cuelgan de la EMPRESA, no del papel | **PASS** | `QUALITY_07_DATA_MODEL.md` §1 |

### D · El puente con PCR y Textiles (GP-33, §39, §40)

| # | Criterio | Veredicto | Evidencia |
|---|---|---|---|
| 9 | `suppliers.external_party_id` y `textile_suppliers.external_party_id` son columnas NUEVAS y OPCIONALES | **PASS** | prueba A2 |
| 10 | Los dos módulos siguen funcionando con Quality apagado: ninguna fila existente se modificó | **PASS** | prueba A2 · RLS A3 |
| 11 | Índice único parcial: dos proveedores del mismo módulo no pueden apuntar a la misma identidad | **PASS** | `0125` §2 |

### E · Incorporar, no crear (§58)

| # | Criterio | Veredicto | Evidencia |
|---|---|---|---|
| 12 | `quality_adopt_supplier` deriva la empresa de la FILA, no del cliente | **PASS** | cuerpo de la RPC |
| 13 | Es idempotente: llamarla dos veces devuelve lo que ya hay | **PASS** | RLS A3 |
| 14 | Incorporar el mismo ACME desde PCR y desde Textiles produce UNA identidad y UN proveedor | **PASS** | RLS A1, A2 |

### F · Duplicados: se sugieren, no se fusionan (§59)

| # | Criterio | Veredicto | Evidencia |
|---|---|---|---|
| 15 | La pantalla ofrece INCORPORAR antes que CREAR; una prueba compara las posiciones en el archivo | **PASS** | prueba A3 |
| 16 | `suggestDuplicateParties` sugiere por NIT y por nombre; no existe ninguna función de fusión | **PASS** | prueba A4 |

### G · Proveedor ≠ sede ≠ categoría (GP-03, §7)

| # | Criterio | Veredicto | Evidencia |
|---|---|---|---|
| 17 | Las tres son tablas distintas, más el alcance que las combina | **PASS** | prueba B1 |
| 18 | La categoría clasifica QUÉ se compra; no dice cuánto importa ni si está aprobado | **PASS** | `QUALITY_07_DATA_MODEL.md` §2 |
| 19 | §50 · el proveedor A de la empresa A ≠ el de la empresa B aunque compartan NIT: sin índice único global | **PASS** | prueba B4 |

### H · El alcance es la unidad de decisión (§8, §15)

| # | Criterio | Veredicto | Evidencia |
|---|---|---|---|
| 20 | `quality_supplier_scopes` combina sede × categoría, ambas opcionales, con cuatro únicos parciales para los nulos | **PASS** | `0125` §4 |
| 21 | Criticidad, evaluaciones y decisiones llevan `scope_id not null` | **PASS** | prueba B2 |
| 22 | La ficha nunca muestra «Aprobación» sin la columna «Alcance» al lado | **PASS** | prueba B3 |

### I · Criticidad: motor reutilizado (GP-05, MDR-46)

| # | Criterio | Veredicto | Evidencia |
|---|---|---|---|
| 23 | `applies_to` ensanchado a `supplier_criticality`; no se creó ningún motor paralelo | **PASS** | prueba C1 |
| 24 | `METHODOLOGY_SCOPES` ensanchado en TypeScript, así que el alcance es alcanzable desde la pantalla | **PASS** | prueba C1 |
| 25 | La clasificación ata `version_id` y es inmutable: publicar otra metodología no recalcula el pasado | **PASS** | prueba C2 · RLS E4 |

### J · Criticidad ≠ desempeño (§9, §10)

| # | Criterio | Veredicto | Evidencia |
|---|---|---|---|
| 26 | La tabla de criticidad no tiene ninguna columna que apunte a una evaluación | **PASS** | prueba C3 |
| 27 | `quality_supplier_criticality_factors` guarda qué se escogió en cada dimensión, desde los NIVELES elegidos | **PASS** | prueba C4bis · RLS E1 |
| 28 | Clasificar no crea ninguna decisión de aprobación | **PASS** | RLS E3 |

### K · La criticidad modula la revisión (GP-20)

| # | Criterio | Veredicto | Evidencia |
|---|---|---|---|
| 29 | La banda de resultado aporta `review_months`, sin una sola columna nueva | **PASS** | prueba C4 |
| 30 | Clasificar un alcance como crítico acorta la cadencia del proveedor de 12 a 6 meses | **PASS** | RLS E2 |

### L · Requisitos: tres grados (GP-06)

| # | Criterio | Veredicto | Evidencia |
|---|---|---|---|
| 31 | Informativo, exigido y bloqueante — en el dominio y en la base | **PASS** | prueba O1 |
| 32 | Ni siquiera un bloqueante suspende por su cuenta, y la pantalla y el papel lo dicen | **PASS** | prueba O3 |

### M · Requisitos: vigencia (GP-17, §17)

| # | Criterio | Veredicto | Evidencia |
|---|---|---|---|
| 33 | La asignación aplica a una categoría XOR a un alcance, impuesto por restricción | **PASS** | `0125` §6 |
| 34 | `effective_from` / `effective_to`: retirar es fechar, no borrar | **PASS** | prueba O2 |
| 35 | Subir el listón hoy no vuelve incumplida una evaluación de ayer | **PASS** | RLS F4 |

### N · Plantillas versionadas (GP-15, §18…§20)

| # | Criterio | Veredicto | Evidencia |
|---|---|---|---|
| 36 | Los criterios cuelgan de la VERSIÓN, no de la plantilla | **PASS** | prueba F1 |
| 37 | Publicar una versión nueva cierra la anterior y no toca ninguna evaluación hecha | **PASS** | RLS D1 |
| 38 | La versión anterior queda `superseded` con fin de vigencia; no se borra | **PASS** | prueba F3 · RLS D2 |

### O · La evaluación ata su versión (§66)

| # | Criterio | Veredicto | Evidencia |
|---|---|---|---|
| 39 | `quality_supplier_evaluations.version_id not null` | **PASS** | prueba F2 |
| 40 | El detalle y el PDF leen los criterios de SU versión, y lo dicen en el papel | **PASS** | `QUALITY_07_EXPORT_COVERAGE.md` §6 |

### P · «No aplica» no es un cero (§22)

| # | Criterio | Veredicto | Evidencia |
|---|---|---|---|
| 41 | Cuatro desenlaces posibles y solo uno puntúa | **PASS** | prueba E1 |
| 42 | La base RECHAZA puntos en un criterio que no se puntuó | **PASS** | prueba E2 · RLS C2 |
| 43 | Un «no aplica» no mueve el resultado: 92 sigue siendo 92 | **PASS** | prueba E3 · RLS C3 |

### Q · Cuánto se pudo mirar (§23)

| # | Criterio | Veredicto | Evidencia |
|---|---|---|---|
| 44 | Sin ningún criterio puntuado devuelve «sin resultado», no cero | **PASS** | prueba E5 |
| 45 | Se dice cuántos criterios se puntuaron, en pantalla y en papel | **PASS** | prueba E4 |

### R · Puntuación ≠ aprobación (GP-12, §21)

| # | Criterio | Veredicto | Evidencia |
|---|---|---|---|
| 46 | `scoreApproves()` devuelve `false` siempre, por diseño y con prueba | **PASS** | prueba D1 |
| 47 | La RPC de cierre devuelve `decides_nothing: true` | **PASS** | prueba D2 · RLS C3 |
| 48 | Cerrar no crea ninguna decisión de aprobación, y el mensaje lo dice | **PASS** | prueba D2 · RLS C4 |

### S · La decisión como acto formal (GP-13, GP-19, MDR-49)

| # | Criterio | Veredicto | Evidencia |
|---|---|---|---|
| 49 | `rationale not null`; una decisión sin fundamento se rechaza | **PASS** | prueba D3 · RLS B4 |
| 50 | Una condicionada sin condiciones se rechaza, en la RPC y en la acción | **PASS** | prueba D6 · RLS B5 |
| 51 | Es inmutable: se sustituye con `superseded_by`, no se edita | **PASS** | prueba D4 · RLS I2, I3 |

### T · Quién decide (GP-07, §77)

| # | Criterio | Veredicto | Evidencia |
|---|---|---|---|
| 52 | El consultor externo administra el dominio pero NO homologa | **PASS** | prueba D5 · RLS J1, J2 |
| 53 | Tampoco escribiendo directamente en la tabla: la política solo concede `select` | **PASS** | RLS J3 |
| 54 | La regla vive en el dominio, en la acción y en la base | **PASS** | `QUALITY_07_APPROVAL_DECISIONS.md` §5 |

### U · Lista de proveedores aprobados (GP-08)

| # | Criterio | Veredicto | Evidencia |
|---|---|---|---|
| 55 | `v_quality_approved_supplier_list` se DERIVA de las decisiones vigentes | **PASS** | RLS B3 |
| 56 | Una aprobación con fecha pasada deja de contar como vigente | **PASS** | prueba N2 · RLS G4 |
| 57 | Un alcance sin decidir no aparece como aprobado | **PASS** | RLS B3 |

### V · Aprobación por alcance (GP-09, GP-31, §36)

| # | Criterio | Veredicto | Evidencia |
|---|---|---|---|
| 58 | Aprobar materia prima NO aprueba calibración | **PASS** | RLS B2 |
| 59 | Suspender un alcance no toca los demás alcances del mismo proveedor | **PASS** | RLS I1 |
| 60 | «No había decisión» ≠ «no aprobado» | **PASS** | RLS F1 |

### W · Reevaluación: cadencia (GP-10, §28)

| # | Criterio | Veredicto | Evidencia |
|---|---|---|---|
| 61 | 12 meses por defecto, configurable proveedor a proveedor | **PASS** | prueba G1 |
| 62 | `nextReviewOn` calcula; no se escribe a mano | **PASS** | prueba G2 |
| 63 | Un proveedor sin evaluar no aparece como vencido | **PASS** | prueba G2 |

### X · Vencer no es suspender (GP-18, GP-25, §74)

| # | Criterio | Veredicto | Evidencia |
|---|---|---|---|
| 64 | Pasarse de la fecha de reevaluación no cambia ninguna aprobación | **PASS** | RLS G2 |
| 65 | Un certificado caducado pasa a `expired` y NO retira la aprobación | **PASS** | RLS G3 |
| 66 | La frase está en pantalla y en papel | **PASS** | prueba G4 |

### Y · El barrido (§29, §45, §73)

| # | Criterio | Veredicto | Evidencia |
|---|---|---|---|
| 67 | Idempotente: dos pasadas seguidas no duplican ni un aviso ni una tarea | **PASS** | RLS G1 |
| 68 | No toca `quality_supplier_approval_decisions` en ninguna rama | **PASS** | prueba G4 |
| 69 | El barrido de otra empresa se rechaza | **PASS** | RLS L4 |

### Z · Incidente ≠ no conformidad (GP-21, §27)

| # | Criterio | Veredicto | Evidencia |
|---|---|---|---|
| 70 | La tabla de incidentes no lleva ninguna clasificación | **PASS** | prueba H1 |
| 71 | Registrar un incidente no abre ningún caso | **PASS** | RLS H1 |
| 72 | `is_data_issue` distingue un fallo del dato de un deterioro del proveedor | **PASS** | prueba H3 |

### AA · Escalar a caso (GP-22, §32)

| # | Criterio | Veredicto | Evidencia |
|---|---|---|---|
| 73 | El caso nace SIN clasificar | **PASS** | prueba H2 · RLS H2 |
| 74 | Lleva referencias al proveedor, al alcance y al incidente | **PASS** | RLS H2 |
| 75 | Las referencias enlazan; no duplican | **PASS** | `0125` §15 |

### AB · Señales (GP-26, §31, §33)

| # | Criterio | Veredicto | Evidencia |
|---|---|---|---|
| 76 | Cinco clases, todas informativas | **PASS** | prueba H4 |
| 77 | La política concede `select` y `update`: no se fabrican desde la aplicación | **PASS** | `0125` §19 |
| 78 | La señal de reevaluación vencida se cierra sola cuando alguien reevalúa | **PASS** | `0125` §17 |

### AC · Motores transversales, no copias (MDR-46, §34, §35)

| # | Criterio | Veredicto | Evidencia |
|---|---|---|---|
| 79 | No se crearon tablas propias de tareas, alertas, acciones ni casos | **PASS** | prueba I1, I5 |
| 80 | El ensanche de los catálogos cerrados es ADITIVO: ningún valor anterior desaparece | **PASS** | prueba I2 |
| 81 | Cinco tipos de tarea y siete de alerta, todos con etiqueta legible | **PASS** | pruebas I2, I3 |

### AD · Bandeja y portada (§44, §46)

| # | Criterio | Veredicto | Evidencia |
|---|---|---|---|
| 82 | Los cuatro asuntos nuevos tienen destino: nunca se enlaza a Documentos por defecto | **PASS** | prueba I4 |
| 83 | Quality Home muestra las señales de proveedores y dice que solo avisan | **PASS** | `app/(app)/(shell)/quality/page.tsx` |

### AE · Verdad histórica (GP-14, §60, §72)

| # | Criterio | Veredicto | Evidencia |
|---|---|---|---|
| 84 | Las tres funciones responden por FECHA, no por hoy | **PASS** | RLS F1…F4 |
| 85 | Distinguen «no había decisión» de «había una decisión negativa» | **PASS** | RLS F1 |
| 86 | Comprueban la pertenencia antes de responder | **PASS** | prueba J2 · RLS L3 |

### AF · Ciclo de vida (§37, §38, §78)

| # | Criterio | Veredicto | Evidencia |
|---|---|---|---|
| 87 | El dictamen dice con números qué impide eliminar, por la puerta común `quality_deletion_eligibility` | **PASS** | RLS K1 |
| 88 | Un guardia `before delete` lo impide de verdad, no solo el dictamen | **PASS** | RLS K2 |
| 89 | Retirar conserva evaluaciones, decisiones y criticidades; y no borra nada en PCR ni Textiles | **PASS** | prueba L2 · RLS K3, K4 |

### AG · RLS y aislamiento (§51, §52, §83)

| # | Criterio | Veredicto | Evidencia |
|---|---|---|---|
| 90 | Las 21 tablas nuevas tienen RLS; las 3 vistas declaran `security_invoker` | **PASS** | pruebas J3, J4 · Staging §4 |
| 91 | `anon` no tiene ni un privilegio sobre el dominio | **PASS** | Staging §4 |
| 92 | Otra empresa no lee, no escribe, no incorpora y no consulta el dictamen | **PASS** | RLS L1…L7 |

### AH · Funciones definer (§54)

| # | Criterio | Veredicto | Evidencia |
|---|---|---|---|
| 93 | Todas fijan `set search_path = public` | **PASS** | prueba J1 · Staging §4 |
| 94 | Ninguna se fía del `p_organization_id` del cliente; las dos exenciones —predicados de permiso y ayudantes revocados a `authenticated`— están declaradas | **PASS** | prueba J2 |
| 95 | `quality_derive_level` se endureció con la comprobación que le faltaba desde QUALITY-05 | **PASS** | `0125` §16 |

### AI · Ni expediente ni ERP (§4, §49)

| # | Criterio | Veredicto | Evidencia |
|---|---|---|---|
| 96 | Sin pedidos, precios, facturas ni importes | **PASS** | pruebas K1, K2 |
| 97 | El contacto guarda lo que la relación comercial necesita; sin documentos de identidad ni datos personales | **PASS** | prueba K3 |
| 98 | El rol no se lee del navegador y no se usa `service_role` para la lógica normal | **PASS** | pruebas J6, J7 |

### AJ · Exportación (§63…§66)

| # | Criterio | Veredicto | Evidencia |
|---|---|---|---|
| 99 | Trece claves por el registro cerrado; ninguna afirma «aprobado» sin decir para qué | **PASS** | prueba L3, L5 |
| 100 | Cinco son `historical` con su versión atada; tres declaran `HISTORICAL_NOT_SUPPORTED` con motivo | **PASS** | `QUALITY_07_EXPORT_COVERAGE.md` §1 |
| 101 | Nombres sin colisión con PCR ni Textiles; inventario regenerado a 142 entidades y 123 claves, 0 PENDING | **PASS** | prueba L4 · `test:export01` I1, I3 |

### AK · UX y lenguaje (§41, §42, §55, §56)

| # | Criterio | Veredicto | Evidencia |
|---|---|---|---|
| 102 | Ficha 360 y vista de sede propias; cuatro entradas de menú, no quince | **PASS** | prueba M1 |
| 103 | Las pantallas dicen «empresa», no «organización» | **PASS** | prueba M2 |
| 104 | Las ocho rutas exigen el módulo, son dinámicas y no enlazan nada que no exista | **PASS** | pruebas M3, M4 |

### AL · Migración y pruebas (§80, §81, §82)

| # | Criterio | Veredicto | Evidencia |
|---|---|---|---|
| 105 | 0125 es la única migración del sprint, append-only y sin destruir | **PASS** | pruebas P1, P2 |
| 106 | Se aplicó y probó primero en LOCAL con `db reset` completo; se corrigió mientras estaba solo en local | **PASS** | `QUALITY_07_STAGING_VALIDATION.md` §1, §2 |
| 107 | `test:quality07` 68/68 · `test:quality07-rls` 48/48 en Local y en Staging · `test:all` EXIT 0 · `build` EXIT 0 | **PASS** | logs de las suites |

### AM · Entornos y estado final (§84…§89, §93, §94)

| # | Criterio | Veredicto | Evidencia |
|---|---|---|---|
| 108 | Staging en 0125, sin reset ni repair, con paridad verificada y datos efímeros retirados lógicamente | **PASS** | `QUALITY_07_STAGING_VALIDATION.md` §3, §6 |
| 109 | Ninguna cuenta QA permanente modificada; ninguna contraseña mostrada | **PASS** | retiro acotado por `name like 'Q07 %'` |
| 110 | Production intacta: cabecera 0111, variables de 32 días, sin despliegue ni alias | **PASS** | `QUALITY_07_STAGING_VALIDATION.md` §7 |
| 111 | Preview branch-scoped a Staging con SSO activo (302), sin tocar Production ni Development; working tree limpio, Supabase REMOTE UNLINKED, push normal y QUALITY-08 no iniciado | **PASS** | `QUALITY_07_STAGING_VALIDATION.md` §8, §9 |

---

## 6 · Recuento

| | |
|---|---|
| Criterios evaluados | **111** |
| **PASS** | **111** |
| GAP | **0** |
| FAIL | **0** |

## 7 · Veredicto

```
QUALITY-07 SUPPLIERS, CRITICALITY & EVALUATION READY FOR USER TESTING
```

**111 PASS · 0 GAP · 0 FAIL**

QUALITY-08 no se ha iniciado.
