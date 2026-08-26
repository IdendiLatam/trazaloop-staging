# QUALITY-06.1 · Matriz de pruebas

## 1 · Las dos suites nuevas

| Suite | Comando | Qué comprueba | Resultado |
|---|---|---|---|
| Pura y estática | `npm run test:quality061` | Que las dos formas concretas de cerrar mal estos huecos no quepan | **46 conformes, 0 fallos** |
| Base real | `npm run test:quality061-rls` | Los cuatro escenarios del encargo, la prueba negativa, permisos y cross-tenant | **28 conformes, 0 fallos** (local **y** Staging) |

`test:quality061` está registrada en `test:all`.

## 2 · La suite contra base real ejercita el CÓDIGO, no una copia

`tests/rls/quality-06-1-…` importa `getOnboarding` y `getEvaluationContext` —los
mismos que corren en producción— y les pasa el cliente de un usuario real. Las
dos funciones aceptan un cliente opcional que la aplicación nunca pasa.

La alternativa habitual —reimplementar las consultas dentro del archivo de
pruebas— habría probado una copia, y la copia siempre acaba siendo más amable
que el original: no tiene los mismos filtros, no pasa por las mismas políticas y
no falla cuando el original falla.

La suite corre con `--conditions=react-server` porque esos módulos son
`server-only`.

## 3 · Qué cubre la suite pura (46)

| Bloque | Afirmación que defiende |
|---|---|
| **A** · Derivado, no dominio | Cero migraciones; ninguna tabla ni columna de onboarding; se compone con ocho tablas de QUALITY-06 o anteriores; **solo lee** |
| **B** · El perfil de la fecha | Se resuelve con `quality_position_version_on(effective_from)`; lo demostrado también se lee en esa fecha; cuando hoy rige otra versión, se distingue en vez de sustituirla |
| **C** · Relaciones reales | Procesos por propiedad o por función del perfil; documentos por propiedad o por relación proceso–documento, nunca «todos leen todo»; cada fila dice por qué aparece; el conocimiento se limita a los procesos del cargo |
| **D** · El checklist no miente | No existe casilla de «documento leído» y se explica por qué; los documentos son informativos y no cuentan como pendientes; no se declara «completo»; cada línea declara su entidad de origen; no se fabrican tareas ni desarrollo |
| **E** · No es RRHH | Ni nómina, ni contrato, ni salario, ni salud, ni disciplina; funciona sin cuenta de Trazaloop y lo dice |
| **F** · El contexto informa | El aviso existe y aparece en pantalla y papel; el puente es siempre cargo → proceso; no hay puntaje, promedio ni ranking; cada línea nombra un proceso o un cargo; nadie usa `service_role` |
| **G** · El periodo correcto | Se filtra por mediciones dentro del periodo; sin mediciones se dice, no se rellena con el valor de hoy; lo irreconstruible se marca «Estado actual»; acciones y casos se filtran por sus fechas |
| **H** · Contexto equilibrado | Hay tonos favorable y desfavorable, y fuentes explícitamente positivas; las siete clases tienen etiqueta |
| **I** · No toca el resultado | La capa de contexto no escribe nada; ninguna migración relaciona mediciones con evaluaciones; cerrar sigue exigiendo evaluador y criterios |
| **J** · Privacidad | El contexto se niega si RLS no entrega la evaluación; la ruta responde 404 y **pide el contexto después** de comprobar el permiso; el onboarding depende de poder leer la ficha; la ruta comprueba que la persona corresponda; el papel separa resultado y contexto |
| **K** · Exportación | Clave y nombre documental; el adaptador no dibuja ni nombra; el inventario clasifica los tres ejes con motivo; Q06+Q06.1 sin pendientes |
| **L** · PDF de verdad | Un onboarding de 45 documentos con encabezado en todas las páginas; un PDF de evaluación donde el contexto **no** está en la página del resultado y no atribuye el indicador a la persona |
| **M** · Alcanzabilidad | El onboarding se abre desde la ficha de persona y desde la del cargo; la evaluación tiene ficha propia enlazada desde el listado; el botón de descarga existe |

## 4 · Los escenarios del encargo, contra base real

| # | Escenario | Bloque | Qué demuestra |
|---|---|---|---|
| §31 | Onboarding | A1–A7 | Cargo y perfil correctos; **sin brecha** con el perfil v1 en las dos competencias; el proceso del que el cargo es propietario y el documento que llega por ese proceso, cada uno con su motivo; el conocimiento pasa de «debería recibirlo» a «ya lo sostiene» al registrar el holder |
| §32 | Histórico | B1–B5 | Se publica el v2 con Auditoría 3 y **el onboarding de la asignación original sigue diciendo v1 / requerido 2, brecha 0**. La expectativa de hoy aparece aparte. Una asignación **nueva** sí arranca con el v2 y su brecha, y eso no mueve el onboarding anterior |
| §33 | Persona sin usuario | A2 | Ana no tiene `profile_id` y el onboarding se construye completo: perfil, competencias, procesos, documentos y conocimiento |
| §34 | Contexto | C1–C6 | El indicador del proceso aparece con 82 y meta 95, marcado «Del periodo evaluado»; ninguna línea atribuye el dato a la persona; no hay puntaje; una medición fuera del periodo **no** entra; y el panel también trae lo favorable |
| §35 | Prueba negativa | D1–D3 | Se corrige el indicador de 82 a 20 por su RPC real: la evaluación —estado, conclusión, fecha y el resultado de cada línea— queda **idéntica**. El contexto sí refleja el 20. Cerrar sigue siendo humano |
| §36 | Cross-tenant | F1–F4 | Onboarding y contexto ajenos devuelven `null`, también mezclando la empresa del parámetro; y las seis tablas que alimentan la derivación devuelven cero filas desde otra empresa |
| §37 | Usuario restringido | E1–E3 | El consultor no obtiene ni el contexto ni el onboarding; quien administra personas sí |

## 5 · Lo que estas pruebas encontraron

1. **Colisión de nombres en el inventario.** CPR ya tenía una entidad
   «Onboarding» —la ayuda de navegación de la implantación—. La comprobación de
   los tres ejes leía esa fila y aprobaba la equivocada. La entidad nueva pasó a
   llamarse «Onboarding del sistema de gestión».

2. **Una prueba que se comparaba con un `import`.** La comprobación de que el
   contexto se pide *después* de verificar el permiso buscaba
   `getEvaluationContext` en el archivo entero, y lo encontraba en la línea de
   importación. Se cambió por la llamada real.

3. **Una prohibición que se prohibía a sí misma.** El detector de puntajes se
   llama `looksLikePersonScore`, así que la comprobación de «no aparece ningún
   puntaje» lo señalaba a él. Se pasó a buscar el **dato** y no la palabra.

4. **Tablas que la sesión no puede escribir.** El primer intento de la suite
   contra base real insertaba configuraciones y mediciones a mano: QUALITY-03
   las reservó a sus RPC. Pasar por la vía real no solo arregló la prueba —la
   hizo válida.

## 6 · Regresión completa

```
npm run test:all
TEST_ALL_EXIT_REAL=0
```

Incluye typecheck, lint, QUALITY-01…06 y 06.1, EXPORT-01…01.3, PCR, Textiles,
TrazaDocs, auth, selector de módulos, equipo e invitaciones y el invariante de
cuentas QA permanentes.

Y contra Staging, además de la suite nueva: `test:quality06-rls` → **58/58**.
