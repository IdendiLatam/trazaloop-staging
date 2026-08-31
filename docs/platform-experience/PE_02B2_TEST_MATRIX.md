# PE-02B2 · Matriz de pruebas

**Cuatro suites, 91 comprobaciones, 0 en rojo.**

| Suite | Naturaleza | Comprobaciones | Comando |
|---|---|---:|---|
| `tests/unit/pe02b2-admin.test.ts` | estática | **40** | `npm run test:pe02b2-admin` |
| `tests/ui/pe02b2-admin.test.tsx` | jsdom | **11** | `npm run test:pe02b2-admin-ui` |
| `tests/rls/pe02b2-faq-admin.test.ts` | **base real** | **20** | `npm run test:pe02b2-faq-admin` |
| `tests/rls/pe02b2-legal.test.ts` | **base real** | **20** | `npm run test:pe02b2-legal` |

Las dos puras entran en `test:all`.

---

## 1 · La matriz A–P de la FAQ · §33

| | Escenario | Qué se afirma |
|---|---|---|
| A | Lista del superadministrador | lista y ve las categorías con cuántas preguntas usan cada una |
| B | Soporte | lee; **crear le devuelve error** |
| C | Admin de empresa | ve **cero filas** y no puede crear |
| D | Crear | nace `draft`, sin revisión, y **no se lee sin sesión** |
| **D2** | **Publicar lo recién creado** | **rechazado: nace «sin comprobar»** |
| E | Editar el borrador tras publicar | **lo publicado no cambia**; se marca «borrador con cambios» |
| F | Lectura sin sesión | sigue viendo lo publicado, no el borrador |
| G | Vista previa | la consola ve el borrador; una sesión cualquiera, no |
| H | Publicar | cambia lo que se lee, cierra la anterior, desaparece el aviso de cambios |
| I | Retirar | deja de leerse, **no borra historia**, soporte sigue viéndola |
| J | Historia | versión, periodo, autor, nota y estado de verificación |
| K | Recuperar | copia al borrador **sin tocar la historia** |
| L | Publicar lo recuperado | crea versión **nueva** |
| M | Afirmación sin comprobar | la consola avisa **y** la base rechaza; comprobada, sale |
| M2 | Salvedad ausente | se dice antes de enviar |
| N | Categorías | crear y renombrar; **soporte no puede** |
| N2 | Retirar una categoría con preguntas | se cuenta cuántas arrastra |
| O | Filtros | categoría, estado, texto y paginación, **en el servidor** |
| P | Procedencia interna | no sale por la vista pública; **sí** la ve la consola |
| **P2** | **Lectura rota** | llega como avería, **no como «no hay»** |

**D2 y P2 no estaban en el encargo** y se añadieron porque el escenario las
pedía: la primera documenta que una pregunta nueva no se puede publicar hasta
que alguien diga en qué se apoya; la segunda es la disciplina de PE-01B aplicada
aquí.

---

## 2 · La matriz Q–AC de los legales · §34

| | Escenario | Qué se afirma |
|---|---|---|
| Q | Documentos vigentes | se leen con y sin sesión |
| Q2 | El anónimo | **no** ve borradores ni archivadas |
| T | Crear sucesora | nace `draft`, sin fecha, con autor |
| T2 | Un borrador | no lo ve el público |
| U | Publicar | queda **una sola vigente** de su tipo, con fecha y autor |
| **R** | **Reescribir la vigente** | **rechazado** |
| R2 | Cambiar título, versión o fecha | rechazado |
| **R3** | **Reescribir con la clave de servicio** | **rechazado** |
| S | Archivada | inmutable; y **no revive** |
| V | Aceptación | queda atada al id y a la versión aceptados |
| W | Versión nueva | **no hereda** la aceptación |
| W2 | Publicar | es lo que hace que se vuelva a pedir |
| AA | Borrar una publicada | rechazado |
| AA2 | Descartar un borrador | permitido |
| AA3 | Descartar una vigente | rechazado, con palabras |
| X | Persona cualquiera | no crea, no publica, **no cambia el texto** |
| Y | Superadministrador | administra y ve la historia con sus aceptaciones |
| Z | Soporte | lee la historia, **no escribe** |
| AB | Lectura pública | no cambió |
| AC | Puerta de aceptación | sigue coherente; sigue pidiendo solo los requeridos |

**Sobre el escenario:** se monta sobre `data_processing`, que **no** es un
documento requerido para entrar. Publicar una versión nueva de `terms` o
`privacy` en la base local dejaría a todas las cuentas de prueba del repositorio
pendientes de aceptar, y las suites que entran a la aplicación empezarían a
rebotar. Lo que se comprueba es idéntico: ni la tabla, ni el disparador, ni las
funciones distinguen el tipo.

---

## 3 · Lo que la suite estática protege · 40 comprobaciones

| Grupo | Qué |
|---|---|
| A | Una migración, es la 0156, no toca 0155 ni ninguna histórica, autorizada en las listas blancas, **sin 0157** |
| B | La inmutabilidad legal: disparador y no política; protege seis campos; el borrador se corrige; una archivada no revive; no se borra lo aceptado |
| C | La sucesión: archiva antes de activar, enlaza en los dos sentidos, las cuatro funciones exigen superadministrador y fijan `search_path`, el anónimo no ejecuta ninguna, la lectura pública y la aceptación **no se tocan** |
| D | La capa: sin cliente administrativo; las revisiones **no** se escriben a mano; los legales pasan por sus funciones; **una actualización silenciosa se detecta**; una avería no es una ausencia |
| E | Permisos: cada acción exige plataforma; las de escritura, superadministrador; y queda escrito que esconder el botón es cortesía |
| F | Borrador y publicado a la vista; la vista previa con sus dos caras; guardar no publica; crear no publica |
| G | La procedencia va aparte; se explica antes de enviar; la pantalla no es la única guardia |
| H | Navegación de plataforma; no aparece en la de una empresa; se reutiliza el lenguaje visual; publicar un legal avisa de lo que provoca |
| I | **Lo que no se hizo**: sin FAQ pública, sin ayuda contextual, sin los carryovers de PE-01, sin precios, sin pantallas fuera de `/platform` |

---

## 4 · Lo que solo se ve pintando · 11 comprobaciones

- Una respuesta pública se pinta en **las dos caras**; una «con sesión», en una
  sola, y se dice por qué.
- La vista previa **no** filtra la procedencia interna.
- El bloqueo se anuncia con `role="status"`, explica de qué depende, y **no
  aparece cuando no hay bloqueo**.
- Cada estado de verificación se dice **con texto**, no solo con color.
- Cada razón dice **qué hacer**, y ninguna filtra jerga del motor.

---

## 5 · Dos defectos encontrados por las pruebas

**Uno de permisos, real.** `support` pudo renombrar una categoría y la consola
dijo «guardado». Causa: una actualización que la RLS no autoriza **no devuelve
error**, devuelve cero filas con éxito. Arreglado pidiendo de vuelta la fila
tocada; sin fila, se cuenta como falta de permiso. Es exactamente la trampa
contra la que avisa §17 —«probar los permisos de verdad, no solo los botones
escondidos»— y no se habría visto mirando la pantalla.

**Uno de invariante del repositorio.** Un módulo `"use server"` solo puede
exportar funciones asíncronas, y las acciones exportaban dos constantes de
texto. Lo detectó una suite existente (`QUALITY-01.2` E3). Los mensajes se
movieron al dominio, donde además los comparten pantallas y pruebas.

---

## 6 · Tres pruebas ajenas corregidas

Las tres afirmaban **una fotografía** donde querían afirmar **una promesa**, y
se rompieron al llegar 0156 sin que su tramo hubiera cambiado en nada.

| Suite | Decía | Dice ahora |
|---|---|---|
| `pe02b1-faq` A1 | «hay una sola migración por encima de 0154» | «PE-02B1 aportó una migración, y es la de la FAQ» |
| `pe02b1-faq` A2 | «no existe 0156» | «la ayuda contextual sigue sin existir» |
| `pe02b1-faq` G1/G2 | «no hay capa de datos ni pantallas de FAQ» | «ni la migración ni su capa usan `service_role`» · «la FAQ **pública** sigue sin existir» |

Es el mismo aviso de §24 de B1 —«comprobar invariantes, no fotografías»—
aplicado a las pruebas de B1.

---

## 7 · Regresión completa

| | Resultado |
|---|---|
| Replay `0001 → 0156` | **0 FAIL** · 52 migraciones en el segundo paso |
| `npm run test:all` | **EXIT=0** |
| `npm run typecheck` | **EXIT=0** |
| `npm run lint` | 0 errores · 66 avisos (línea base) |
| `npm run build` | **EXIT=0** |
| Suites de PE-02B1 | 35 + 17 + 13 + 16, todas en verde tras el replay |
| `isolation`, `platform`, `deploy-safety`, `launch`, `t9f-module-access` | EXIT=0 |
