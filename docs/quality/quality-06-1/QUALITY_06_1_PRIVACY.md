# QUALITY-06.1 · Privacidad

Este micro-sprint no crea ningún permiso nuevo. Se apoya en los tres círculos
que QUALITY-06 ya implementó, y su único trabajo es **no abrirlos**.

## 1 · El onboarding vive en el círculo de la ficha

`getOnboarding` empieza leyendo la asignación y **la ficha de la persona**. Esa
segunda lectura pasa por `quality_people_select`, que evalúa
`quality_can_read_person(organization_id, id)` fila a fila. Si no la entrega,
la función devuelve `null` y la ruta responde 404.

Consecuencia comprobada contra base real: un `consultant` con acceso general a
Quality —que sí ve el organigrama y el catálogo de competencias— **no** puede
abrir el onboarding de nadie.

La ruta lleva además el identificador de la persona y se comprueba que
corresponda a la asignación. No se puede alcanzar el onboarding de alguien desde
la ficha de otra persona cambiando un identificador en la URL.

## 2 · El contexto vive en el círculo del desempeño

`getEvaluationContext` empieza leyendo la **evaluación**. Si RLS no la entrega
—porque quien mira no es `admin`, ni `quality`, ni la persona evaluada— devuelve
`null` y no hay panel. El contexto no puede ser una puerta trasera a la
evaluación, y por eso se pide **después** de comprobarla, nunca antes.

Comprobado: el mismo `consultant` obtiene `null` tanto del contexto como del
onboarding, y quien administra personas obtiene los dos.

## 3 · El panel no eleva privilegios

Todo el contexto se lee con **la sesión de quien mira**. No hay ninguna consulta
con `service_role`, y una prueba estática lo verifica sobre las dos capas
nuevas.

Eso significa que el panel muestra exactamente lo que esa persona ya podría
consultar por su cuenta. Si una fuente le está vedada, no aparece — y no
aparece en silencio: se dice **cuántas** fuentes quedaron fuera, nunca cuáles.
El detalle sería precisamente la información que se negó.

## 4 · Identificadores arbitrarios

La única entrada de cada derivación es el identificador de la **asignación** o
de la **evaluación**. La empresa sale de la sesión. Persona, cargo, procesos,
indicadores y documentos se derivan de ahí: el cliente no elige ninguno.

Comprobado contra base real:

| Ataque | Resultado |
|---|---|
| Otra empresa con la asignación correcta | `null` |
| Otra empresa con su propia empresa y una asignación ajena | `null` |
| Un usuario de la empresa A pasando la empresa B en el parámetro | `null` |
| Lo mismo sobre la evaluación y su contexto | `null` |
| Lectura directa por PostgREST de las seis tablas que alimentan la derivación | cero filas |

## 5 · El papel

El PDF de onboarding y la sección de contexto del PDF de evaluación se
construyen con la **misma sesión** que descarga. Un PDF no concede permisos: lo
que no se puede ver en pantalla tampoco entra en el archivo.

Los dos llevan el aviso de que un PDF no lleva consigo los permisos que lo
produjeron, porque un archivo se reenvía y el aviso viaja con él.

## 6 · Lo que el onboarding no imprime

Ni nómina, ni contrato, ni salario, ni beneficios, ni información médica, ni
expediente disciplinario. Una prueba recorre la capa de datos, la pantalla y el
adaptador de PDF buscando esas palabras.

## 7 · Sin esquema, sin superficie nueva

QUALITY-06.1 **no añade ninguna migración**. No hay tabla nueva que proteger, ni
política que escribir, ni privilegio que revocar. Las proyecciones consultan
tablas que ya tenían RLS, y por eso el ataque directo por PostgREST devuelve lo
mismo que antes: nada.
