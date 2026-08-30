# QUALITY-12.3 · PARTES INTERESADAS · CIERRE

**Estado: funcionalmente cerrado.**
Migraciones **0149**, **0150**, **0151** · Local **0151** · Staging **0151** ·
Production **0111**, intacta.

---

## 1 · Qué se construyó, por fases

| Fase | Commit | Qué dejó |
|---|---|---|
| **12.3A** arquitectura | `b9b059b` | PI-01 … PI-39, congelados y no reinterpretados desde entonces |
| **12.3B1** fundación | `45e29ec` | 8 tablas, RLS, permiso de dominio, 3 guardianes, siembra de 15 categorías |
| **12.3B2** aplicación | `3873ceb`, `2a687b3` | dominio puro, capa de datos, 21 acciones, 5 eventos, referencias, Revisión por la Dirección, fuentes de Intelligence |
| **12.3B3A** experiencia | `6383865`, `c2bd25e` | tres rutas, nueve componentes, menú **Contexto**, y su aceptación automatizada |
| **12.3B3B** cierre | `f36e20e` + este | automatización, Intelligence, PDF, ayuda |

## 2 · Las decisiones que sostienen el dominio

**La identidad no se duplica.** Una parte interesada externa es
`quality_external_parties`, la misma que usan Proveedores y Voz del cliente. Un cliente
que además es parte interesada no genera una segunda ficha.

**Un análisis no se edita: se sucede.** El anterior se conserva entero y se cierra su
vigencia. Es lo que permite responder «qué decíamos en marzo» sin creerse una memoria.

**Necesidad, expectativa y requisito son tres cosas.** Solo la tercera obliga y solo
ella pide subtipo. Convertir crea una fila nueva que apunta al origen y guarda por qué.

**Dos relaciones son centrales y tienen tabla propia** —requisito→proceso y
estrategia→requisito— porque tienen vigencia. `work_references` no la tiene: meterlas
ahí habría ahorrado dos tablas a cambio de no poder responder «qué procesos lo atendían
en marzo». La base rechaza esas dos parejas por la vía genérica, y la interfaz ni las
ofrece.

**La pertinencia no se deriva de la prioridad.** Son dos preguntas, y hay una función
en el dominio que lanza si alguien intenta confundirlas. Priorizar es opcional; una
puntuación sin metodología no se enseña.

**El responsable es un cargo.** No una persona, no texto libre.

**«Revisado, sin cambios» se registra** y no fabrica un análisis nuevo. Sin eso, un
análisis desatendido y uno comprobado el mes pasado se ven iguales.

## 3 · Verdad histórica

Vigencias con `effective_from` **inclusivo** y `effective_to` **exclusivo**: nunca hay
dos vigentes el mismo día ni un hueco entre ellos.

`as_of` recorre **todas** las capas —análisis, requisitos, vínculos con procesos,
estrategias—, la pantalla lo anuncia y **apaga toda la escritura**, el contexto de
Intelligence lo respeta, y el PDF de esa fecha no rellena un solo hueco con datos de
hoy.

Una fila ya sucedida no admite **ninguna** modificación. Esa regla se escribió mal en
B1 —protegía las columnas de vigencia y dejaba reescribir el contenido, que es lo
contrario de lo que decía su propio comentario— y la encontró una prueba de B2, no una
lectura del código. Corregida en 0150.

## 4 · Independencia de módulo

Todo el dominio funciona en una empresa con **Quality y sin PCR ni Textiles**: ninguna
pantalla enlaza a esos módulos y el recorrido completo se comprueba en esa condición.

## 5 · Aislamiento

FK compuestas `(organization_id, id)` como primera barrera y RLS como segunda. Nunca
`service_role` en tiempo de ejecución. Cada suite contra base real prueba con dos
empresas y con quien no es miembro: no ve, no escribe, no descarga, y su contexto de
Intelligence viene vacío.

## 6 · Pruebas

| Suite | Comprobaciones |
|---|---|
| `quality123` · `quality123-rls` | 17 · 31 |
| `quality123b2-domain` · `-domain-rls` · `-integrations` · `-history` | 20 · 15 · 13 · 8 |
| `quality123b3a-ux` · `-ui` · `-e2e` | 36 · 15 · 32 |
| `quality123b3b-automation` · `-intelligence` · `-outputs` · `-help` | 13 · 8 · 9 · 8 |

**225 comprobaciones propias**, todas por código de salida. `npm run test:all`,
`typecheck`, `lint` y `build`: **EXIT=0**. Replay limpio 0001 → 0151 sin fallos.

Y una validación humana automatizada con navegador real sobre el Preview: P1–P10 PASS,
con doce capturas en `qa/browser-validation/`.

El humo visual de B3B —capturas de los PDF y de la ayuda enriquecida en el navegador—
**no** se ejecutó: el Preview nuevo nace en otro host y pide iniciar sesión, y se
decidió cerrar sin ese paso. Lo funcional está cubierto por
`test:quality123b3b-outputs`, que descarga los PDF de verdad contra el build de
producción; lo que queda es juicio visual, y está dicho en la matriz de pruebas.

## 7 · Lo que este dominio NO hace

No acredita conformidad. No declara nada certificado. No decide la pertinencia por su
cuenta. No borra: cierra vigencias. No manda un aviso que nadie haya adoptado. No llama
a ningún modelo para calcular la entrada formal de la Revisión por la Dirección. Y no
guarda un contacto de nadie en el contexto de Intelligence.

## 8 · Diferido, y no es una carencia de 12.3

Estos puntos pertenecen al sprint transversal posterior —**PLATFORM EXPERIENCE &
COMMERCIAL HARDENING**— y a QUALITY-13:

- A · endurecimiento global de las ayudas «i» de toda la plataforma;
- B · sistema global de vídeo tutorial por página;
- C · administración de tutoriales desde Superadmin;
- D · vídeo de bienvenida y «No volver a mostrar»;
- E · FAQ pública;
- F · planes y precios;
- G · pasarela de pagos;
- H · modelo comercial de soporte (Full autoservicio / Extra con tickets);
- I · jerarquía visual final de módulos con Quality como protagonista;
- J · integración con QUALITY-13.

Y dentro del propio dominio, dos cosas conscientes: los **formatos de exportación
distintos del PDF** no se añadieron porque el motor universal solo produce PDF, y el
**contexto de la empresa (4.1)** no se implementó, aunque el grupo «Contexto» del menú
ya está preparado para recibirlo.

## 9 · Estado de los entornos

| | Cabecera | Qué tiene |
|---|---|---|
| Local | 0151 | todo, replay limpio verificado |
| Staging `qchzkxbnbqeyuxinipln` | 0151 | todo, con datos QA prefijados `QA Q123` |
| **Production** `mvmpadeixomwkpxbnhky` | **0111** | **sin tocar**: ni migración, ni despliegue, ni variables |
