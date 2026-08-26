# QUALITY-06 · Matriz de pruebas

## 1 · Las dos suites nuevas

| Suite | Comando | Qué comprueba | Resultado |
|---|---|---|---|
| Pura y estática | `npm run test:quality06` | Que las separaciones de PC existan **en el código**, no solo en la prosa. Sin red ni base de datos | **77 conformes, 0 fallos** |
| Base real | `npm run test:quality06-rls` | Los diez escenarios del encargo, la privacidad en tres círculos y los ataques cross-tenant, con sesiones reales | **55 conformes, 0 fallos** (local **y** Staging) |

`test:quality06` está registrada en `test:all`. La suite RLS se ejecuta aparte,
igual que las de QUALITY-01…05, porque necesita un proyecto Supabase real.

## 2 · Qué cubre la suite pura (77)

| Bloque | Afirmación que defiende |
|---|---|
| **A** · Cargo ≠ Persona ≠ Usuario | La persona existe sin cuenta; la asignación admite persona sin `profile_id` pero exige un actor; no hay segundo catálogo de cargos; hay backfill y no borrado; el titular principal se resuelve por su tipo y nunca por `[0]` |
| **B** · La ficha no es un expediente laboral | Ni el esquema ni ninguna tabla del sprint guardan salario, banco, salud, religión, orientación sexual ni disciplina; no se abre ningún dominio fuera de alcance |
| **C** · Competencia ≠ Desempeño | El desempeño vive en tablas propias; cerrar una evaluación no toca la competencia; no existe puntaje, promedio ni ranking; la vista no agrega; el resultado es una etiqueta, no un número |
| **D** · Las cuatro capas | Asistencia y aprendizaje en columnas distintas; «no se evalúa» es legítimo; terminar no vuelve eficaz; el criterio se declara antes; un «no eficaz» no se reescribe; los cuatro vocabularios no se solapan |
| **E** · Brecha ≠ capacitación | Nueve tipos de desarrollo; la brecha se calcula y no se guarda; el dominio se llama desarrollo; la necesidad conserva su origen; el plan admite items durante el año con fecha y motivo |
| **F** · PC-23 | El requisito cuelga de la versión, no del cargo; publicar cierra la anterior sin borrarla; hay función para leer el requisito de una fecha; la competencia se sustituye; existen documentos históricos |
| **G** · PC-24 | Sin vencimiento no vence; el texto dice *revisar*; el barrido marca la evidencia y no la competencia; la frase «persona incompetente» no existe en ninguna capa |
| **H** · Holder ≠ dueño | La tabla se llama holders; hay titular principal explícito y único; conocimiento tácito existe; la señal habla del conocimiento; el barrido no crea riesgos; verificar exige decir en qué se comprobó |
| **I** · La lección propone | Cuatro columnas separadas y obligatorias las dos primeras; decidir no modifica documentos, procesos, competencias ni actividades |
| **J** · Motores transversales | No hay tablas paralelas; el ensanche es aditivo y no pierde ningún valor anterior; la bandeja conoce los asuntos nuevos y sabe a dónde llevan; cada tipo tiene etiqueta; la evidencia usa `work_references`; cada `insert` de alerta tiene su guarda de duplicado |
| **K** · Privacidad | Tres círculos; sin rol «HR» inventado; la ficha no se lee con `is_org_member`; la evaluación se filtra por persona; toda tabla enciende RLS, revoca y tiene política; `anon` no recibe nada; las vistas son `security_invoker`; **toda función `security definer` que reciba una empresa comprueba quién pregunta**; nadie usa `service_role`; el listado no imprime lo sensible |
| **L** · Contrato PDF | Las entidades nuevas están clasificadas en los cuatro estados finales; las claves prometidas existen; cada exportación declara su nombre documental; ningún adaptador lo escribe en el documento ni fabrica bytes; los `current` explican por qué; la matriz no ordena ni suma |
| **M** · Fuera de alcance | Sin IA; sin dependencia de PCR ni Textiles; migración append-only; ningún `DELETE` sobre lo que conserva historia; el veredicto de borrado conoce las entidades nuevas |
| **N** · Permisos en interfaz | Las tres puertas coinciden con las de la base; **todas** las acciones de servidor pasan por `gate()`; la vigencia se evalúa por fechas; la escala es configurable y no se impone |
| **O** · PDF de verdad | Se renderiza un organigrama de 144 cargos y una matriz de 60 filas: multipágina, con encabezado en **todas** las páginas, sin reordenar filas y sin que un carácter de control rompa el renglón |

## 3 · Los diez escenarios (§69–§78) contra base real

| # | Escenario | Bloque | Qué demuestra |
|---|---|---|---|
| 1 | Cargo / persona | A1–A5 | Ana y Carlos conviven con vigencias; la fecha de Ana devuelve Ana y la de Carlos devuelve Carlos; la vista de titular vigente lee el nombre de la **persona**, y un cargo admite cotitulares pero un solo titular vigente |
| 2 | Cambio de competencia | B1–B5 | Con el perfil v1 no había brecha; se publica v2 exigiendo más; **la fecha anterior sigue diciendo 2** y hoy la brecha es 1; la decisión anterior queda sustituida, no reescrita |
| 3 | Desarrollo | C1 | La brecha genera necesidad y el plan la resuelve con **práctica supervisada**, no con un curso |
| 4 | Asistencia no es eficacia | C2–C3 | Asistió al 100 %: el aprendizaje sigue `not_evaluated` y, al terminar la actividad, la eficacia sigue **pendiente** y no se fabricó ninguna evaluación |
| 5 | Eficacia fallida | D1–D3 | «No eficaz» se conserva y no se puede maquillar; el consultor ni siquiera lo ve |
| 6 | Certificación por vencer | E1–E4 | Un barrido → **una** alerta, con el texto que aclara que no implica incompetencia; tres barridos → sigue **una**; al vencer, la evidencia pasa a `expired` y la competencia declarada **no cambia** |
| 7 | Evaluación anual | F1–F4 | Población declarada; no se cierra una evaluación sin decir contra qué se evaluó; cerrar conserva; y no tocó la competencia |
| 8 | Concentración de conocimiento | G1–G5 | Señal 1, no conformidades 0, riesgos 0; el barrido no duplica; promover a riesgo registra **quién** decidió; la señal se resuelve sola al dejar de estar concentrado |
| 9 | Offboarding | H1–H4 | El informe detecta lo que quedaría descubierto **antes** de cerrar; desvincular conserva asignaciones, nombre y actos históricos; y el borrado se rechaza ofreciendo desvincular |
| 10 | Lección aprendida | I1–I3 | Las cuatro preguntas; aceptar una propuesta **no** crea documentos ni formación; no se decide dos veces |

## 4 · Ataques (§79, §80)

| Bloque | Ataque | Resultado |
|---|---|---|
| J1–J7 | El consultor con acceso general a Quality intenta abrir ficha, competencia, evidencia, evaluación, líneas de evaluación y el veredicto de borrado de una persona | Ve el organigrama; **no ve** nada de lo demás |
| J5–J6 | La propia persona lee lo suyo, no lo ajeno, y no puede editarse la ficha | Correcto |
| K1–K2 | Empresa B lee las once tablas de A por `organization_id` y **por UUID conocido**, y las cuatro vistas | Cero filas |
| K3–K4 | `INSERT`/`DELETE` directos por PostgREST contra A | Rechazados; el `DELETE` no borra nada |
| K5 | Relación cruzada: persona de B en cargo de A; competencia de B exigida por cargo de A | Rechazadas |
| K6 | Referencia de A a una persona de B | Rechazada |
| K7 | Las RPC del dominio con identificadores ajenos | Rechazadas |
| K8 | Las funciones `security definer` con `p_organization_id` de otra empresa | Devuelven vacío; el barrido ajeno se rechaza |
| K9 | El consultor lee competencia por RPC en vez de por tabla | Devuelve vacío; y sí puede leer lo que es estructura |
| K10 | La sesión fabrica tareas y alertas a mano | Rechazado |

## 5 · Defectos que encontraron estas pruebas

No son hipotéticos: los cinco existieron durante el sprint y se corrigieron.

1. **El guardián de 0112 bloqueaba a las personas sin cuenta.**
   `quality_assignment_profile_must_belong()` exigía membresía activa contra
   `profile_id`. Con una persona sin cuenta no había membresía que encontrar, y
   el operario que este sprint viene a habilitar no podía ser titular de nada.
   Ahora la comprobación se aplica **solo cuando hay cuenta**, y se añade la
   simétrica para personas.

2. **Las funciones `security definer` eran un túnel por debajo de RLS.**
   Recibían `p_organization_id` del cliente y no comprobaban nada. Se
   endurecieron las seis, y una prueba estática impide que vuelva a pasar.

3. **`v_quality_position_current_holder` habría dejado en blanco al titular sin
   cuenta**, apagando en silencio el propietario del proceso, del indicador, del
   objetivo y del caso.

4. **Dos políticas RLS con nombre inconsistente** hacían que una tabla pareciera
   sin política ante la comprobación K5.

5. **Dos pruebas heredadas congelaban el número de la última migración**
   («ninguna por encima de 0122»). Decían la verdad el día que se escribieron y
   habrían fallado por cualquier sprint posterior. Se reescribieron para
   defender la invariante real: que exportar y normalizar un logo **no tienen
   esquema propio**.

## 6 · Regresión completa

```
npm run test:all
TEST_ALL_EXIT_REAL=0
```

Incluye typecheck, lint, QUALITY-01…06, EXPORT-01…01.3, PCR, Textiles,
TrazaDocs, auth, selector de módulos, equipo e invitaciones, y el invariante de
cuentas QA permanentes.
