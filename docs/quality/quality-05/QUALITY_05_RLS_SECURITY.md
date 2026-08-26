# QUALITY-05 · RLS y seguridad

**Decisiones:** MDR-03, MDR-04, MDR-42, §53, §55, §56, §57, §85.

## Tres capas, no una

1. **Privilegios** — qué puede tocar la sesión, tabla por tabla.
2. **RLS** — qué filas, deny-by-default.
3. **RPC `security definer`** — qué actos formales, con rol y estado comprobados.

## 1 · Privilegios explícitos: la lección de 0115 y 0118

En un proyecto remoto de Supabase, una tabla nueva nace con `arwdDxtm` para
`authenticated`. Conceder `SELECT` **no retira** lo que el entorno concede, y un
`DELETE` sin política devuelve **204 con cero filas, no un error**.

> «Cero filas» no es «denegado».

Por eso 0122 revoca de forma explícita, tabla por tabla, y concede solo lo que hace
falta:

| Tablas | Sesión puede |
|---|---|
| `quality_risk_assessments`, `..._factors`, `quality_opportunity_assessments`, `..._factors`, `quality_control_effectiveness_reviews`, `quality_risk_treatment_plans`, `quality_risk_materializations`, los tres `*_codes` | **solo SELECT** — se escriben por RPC |
| metodologías, versiones, escalas, niveles, riesgos, causas, consecuencias, N:M, controles, señales, oportunidades | SELECT + DML **bajo RLS** |

Todo lo que es EVALUACIÓN, DECISIÓN o HISTORIA es de solo lectura para la sesión.

## 2 · Las vistas usan `security_invoker`

`v_quality_risk_overview` y `v_quality_opportunity_overview` se declaran con
`security_invoker = true`.

Sin eso, una vista se ejecuta con los privilegios de quien la creó y **se salta la
RLS** de las tablas que consulta. Este defecto existió durante el sprint: la suite
RLS lo detectó porque una empresa ajena podía leer la proyección de otra, y por eso
la comprobación K1 mira **también** por la vista y no solo por la tabla.

## 3 · RLS

Todas las tablas nuevas: `enable row level security`, política de lectura para
cualquier miembro (`is_org_member`), y escritura por rol (`has_org_role`).

| Acto | Roles |
|---|---|
| Ver | admin, quality, consultant (cualquier miembro) |
| Identificar, evaluar, registrar controles y materializaciones | admin, quality, consultant |
| Decidir tratamiento, cerrar, reabrir | admin, quality |
| Publicar metodología, aprobar aceptación | admin, quality |

Roles **reales** del proyecto. No se inventa un «Risk Manager», y una prueba pura
lo comprueba sobre el código sin comentarios.

## 4 · Las RPC comprueban todo en el mismo acto

Las doce funciones formales verifican, sin excepción: sesión (`auth.uid()`),
pertenencia y rol (`has_org_role`), estado de la entidad, ámbito y vigencia de la
metodología, pertenencia de cada referencia, `security definer` y
`set search_path = public`. Una prueba pura recorre las doce y falla si a alguna le
falta una comprobación.

## 5 · Referencias tipadas, sin polimorfismo ciego (§52)

`work_references` sigue siendo un catálogo **cerrado**. QUALITY-05 lo ensancha con
seis tipos referenciables y cuatro propietarios nuevos, y **reescribe** el
disparador de validación.

Ese reescrito no era opcional: el original resolvía el propietario con
`if case … else action`. Al admitir cinco tipos, ese `else` habría validado un
riesgo contra la tabla de acciones y lo habría rechazado siempre.

El disparador comprueba, para cada referencia: que lo referenciado **existe** y que
es **de la misma empresa**, y lo mismo para el propietario.

## 6 · Ataques directos por PostgREST — probados

Sección K de `tests/rls/quality-05-risks-opportunities.test.ts`, con la sesión real
de una empresa ajena:

| Intento | Resultado |
|---|---|
| Leer riesgo ajeno (tabla y **vista**) | 0 filas |
| Leer metodología, escalas, niveles ajenos | 0 filas |
| Leer controles, evaluaciones, planes, materializaciones, oportunidades ajenos | 0 filas |
| Evaluar un riesgo ajeno | error |
| Tratarlo, materializarlo, revisarlo, cerrarlo, reabrirlo | error (los cinco) |
| Crear una referencia cruzada entre empresas | error del disparador |
| Pedir el dictamen de eliminación de lo ajeno | `not_found`, bloqueos vacíos |
| `DELETE` sobre riesgo y control ajenos | **no borra nada** (se verifica la fila, no el código de respuesta) |
| Insertar directamente evaluación, plan o materialización | error (los tres) |
| Fabricar una evaluación a mano en la propia empresa | error de privilegios |
| Alterar el puntaje ya calculado | error, y el puntaje no cambia |

## 7 · Quality-only

Nada de esto depende de PCR ni de Textiles. Una prueba pura lo comprueba sobre los
tres archivos del dominio.
