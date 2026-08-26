# QUALITY-07 · Matriz de pruebas

## 1 · Las suites

| Suite | Qué comprueba | Resultado |
|---|---|---|
| `npm run test:quality07` | 68 comprobaciones puras y estáticas | **68 conformes, 0 fallos** |
| `npm run test:quality07-rls` | 48 contra base real, con sesiones reales | **48 conformes, 0 fallos** (Local **y** Staging) |
| `npm run test:all` | regresión completa de la plataforma | **TEST_ALL_EXIT_REAL=0** |

`test:quality07` está registrada en `test:all`.

## 2 · Las puras (`tests/unit/quality-07-suppliers-evaluation.test.ts`)

| Bloque | Qué defiende |
|---|---|
| **A** · Cero gestión duplicada | identidad transversal · puente opcional a PCR y Textiles · incorporar antes que crear · sin fusión automática |
| **B** · Proveedor ≠ sede ≠ categoría ≠ alcance | cuatro tablas · los tres actos anclados al alcance · nunca «aprobado» sin decir para qué · mismo NIT en empresas distintas |
| **C** · Criticidad ≠ desempeño | motor reutilizado, no duplicado · versión atada e inmutable · sin dependencia de evaluaciones · factores desde los niveles · cadencia de revisión |
| **D** · Puntuación ≠ aprobación | `scoreApproves` siempre falso · `decides_nothing` · decisión con fundamento · sin columna de aprobación en el perfil · inmutable · el consultor no homologa · condicionada con condiciones |
| **E** · «No aplica» no es un cero | cuatro desenlaces · la base rechaza puntos · el cálculo no baja · se dice cuánto se miró · sin datos no se inventa un cero |
| **F** · La plantilla se versiona | criterios en la versión · evaluación atada · **cerrada es final** · sustituida, no borrada |
| **G** · Vencer no es suspender | cadencia configurable · cálculo de la siguiente · reevaluación es evaluación nueva · el barrido no toca decisiones · extraordinaria con motivo |
| **H** · Incidente ≠ no conformidad | sin clasificación en la tabla · caso sin clasificar · fallo del dato · señales que solo avisan |
| **I** · Motores transversales | sin tablas propias de tareas/alertas/acciones · ensanche aditivo · destinos de la bandeja · plan de mejora como acción |
| **J** · Seguridad | `search_path` en todas · **ninguna definer se fía del `p_organization_id`** · RLS en las 21 · `security_invoker` en las 3 · políticas bien nombradas · rol no leído del navegador · sin `service_role` |
| **K** · No es un ERP | sin pedidos, precios ni facturas · sin importes · contactos sin datos personales |
| **L** · Ciclo de vida y papel | dictamen y guardia · retirar no borra en PCR/Textiles · papel por entidad · nombres sin colisión · sin «aprobado» sin alcance |
| **M** · UX y lenguaje | cuatro entradas de menú · «empresa», no «organización» · rutas protegidas y dinámicas · no se enlaza lo que no existe |
| **N** · Tendencia | no se afirma con menos de dos · la caducada no cuenta como vigente |
| **O** · Requisitos | tres grados · asignación fechada · el bloqueante no actúa solo |
| **P** · Migración | 0125 es la única del sprint · no destruye |

## 3 · Las de base real (`tests/rls/quality-07-suppliers-evaluation.test.ts`)

Los doce escenarios del encargo, con cinco usuarios reales y dos empresas:

| Escenario | Bloque | Comprobaciones |
|---|---|---|
| 1 · el mismo ACME desde dos módulos | A | 3 |
| 2 · aprobado ¿para qué? | B | 5 |
| 3 · un 92 no aprueba a nadie | C | 6 |
| 4 · la plantilla se versiona | D | 2 |
| 5 · criticidad no es desempeño | E | 4 |
| 6 · la verdad histórica | F | 4 |
| 7 · vencer no es suspender | G | 4 |
| 8 · el incidente no es una NC | H | 2 |
| 9 · suspender un alcance | I | 3 |
| 10 · el consultor no homologa | J | 3 |
| 11 · retirar conserva | K | 5 |
| 12 · lo de otra empresa no existe | L | 7 |

Todo corre con la **sesión real** de cada usuario. El cliente administrativo
solo crea cuentas y membresías: con `service_role` se saltaría RLS y no se
probaría nada.

## 4 · Corrió también contra Staging

```
NEXT_PUBLIC_SUPABASE_URL=https://qchzkxbnbqeyuxinipln.supabase.co \
npx tsx tests/rls/quality-07-suppliers-evaluation.test.ts
  → 48 conformes, 0 fallos
```

No es una repetición decorativa. Un proyecto de Supabase concede privilegios por
defecto sobre cada tabla nueva; las comprobaciones que verifican que el
consultor **no** decide y que otra empresa **no** ve nada son exactamente las
que habrían fallado sin las revocaciones explícitas de la migración.

## 5 · Los defectos que encontraron las pruebas

Cinco, todos corregidos antes de aplicar 0125 a Staging.

### 5.1 · Una evaluación cerrada se podía reescribir

`update quality_supplier_evaluations set score = 100` funcionaba sobre una
evaluación cerrada hace dos años. La línea de evolución se habría movido sin que
nadie hubiera evaluado otra vez, y la comparación entre periodos habría dejado
de significar nada.

**Corregido:** disparador `quality_supplier_evaluation_is_closed` sobre `update`
y `delete`, más `quality_supplier_result_parent_is_open` sobre sus criterios. La
guarda mira `old.status` para no bloquear el propio cierre.

### 5.2 · Los factores de criticidad se escribían con la dimensión en blanco

`quality_assess_supplier_criticality` leía `scale_id` y `level_id` del rastro
que devuelve `quality_derive_level`. Ese rastro está pensado para leerse
—código, etiqueta, valor y peso— y **no lleva identificadores**, así que la
inserción violaba el `not null`.

**Corregido:** los factores se escriben desde los niveles elegidos
(`from quality_risk_scale_levels where id = any(p_level_ids)`).

### 5.3 · `METHODOLOGY_SCOPES` no conocía el alcance nuevo

La base admitía `supplier_criticality`, pero la constante de TypeScript seguía
con dos valores. El motor existía y era inalcanzable desde la pantalla de
metodologías.

**Corregido:** ensanchada en `lib/domain/risks.ts`, con su etiqueta.

### 5.4 · La ASL no seguía la nomenclatura de la plataforma

`test:export01-2` exige que todo listado se llame «Listado…». «Lista de
proveedores aprobados» lo incumplía.

**Corregido:** `documentName` pasa a «Listado de proveedores aprobados»; el
nombre habitual de la norma se conserva en el cuerpo del papel.

### 5.5 · Tres exportaciones sin botón

`quality.approved-supplier.list`, `quality.supplier-approval.historical` y
`quality.supplier-performance.detail` estaban en el registro y en ninguna
pantalla. La prueba H1 de `test:export01` lo detectó.

**Corregido:** botón en el listado de proveedores y dos en la ficha.

## 6 · Y tres defectos de las propias pruebas

Se anotan porque su corrección **no** relajó ninguna afirmación:

- la suite escribía `role` donde la columna es `role_code`;
- consultaba `work_references.case_id`, que no existe: la tabla usa
  `owner_kind` / `owner_id` / `ref_kind`;
- llamaba a `quality_supplier_deletion_verdict` directamente, que está revocada
  a `authenticated` **a propósito**. La puerta pública es
  `quality_deletion_eligibility('supplier', id)`, la misma que para todo lo
  demás.
