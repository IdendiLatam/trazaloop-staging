# QUALITY-12.3B3A · MATRIZ DE PRUEBAS

Dos suites nuevas, 49 comprobaciones. Todas verificadas por **código de salida**.

| Suite | Comando | Qué prueba |
|---|---|---|
| Forma del código | `npm run test:quality123b3a-ux` | 35 comprobaciones estáticas |
| Cableado en un DOM real | `npm run test:quality123b3a-ui` | 14 comprobaciones montando componentes |

Las dos entran en `test:all`.

---

## 1 · Por qué hacen falta las dos

La suite estática comprueba lo que no se ve ejecutando: que las rutas existan y estén
protegidas, que la búsqueda y el resumen sean de servidor, que ningún componente escriba
en la base, que la interfaz no ofrezca lo que la base rechaza.

La suite de DOM comprueba lo contrario: que los botones hagan lo que dicen. En
QUALITY-12.2C hubo cincuenta y dos comprobaciones en verde mientras el botón no hacía
nada —todas nombraban la acción correcta, y esa parte funcionaba; lo roto era el
cableado—. Las secciones de esta pantalla tienen justo el patrón que se rompe sin
avisar: un botón `type="button"` que abre un diálogo y un `requestSubmit()` que envía el
formulario desde otro sitio.

**Las acciones de servidor no se ejecutan** en la suite de DOM: un escuchador en fase de
captura intercepta el envío, se queda con los datos y lo cancela. Lo que se comprueba es
que el envío **ocurre** y **con qué**.

---

## 2 · Forma del código · `tests/unit/quality-12-3b3a-ux.test.ts`

| | Qué demuestra | §
|---|---|---|
| A | las tres rutas existen y pasan por el guard del módulo | 33.A |
| B | ni una referencia a PCR o Textiles | 33.B |
| B2 | grupo «Contexto», primero en el menú, sin 4.1 implementado | 2 |
| C | el resumen viene de la base y no se llama «desempeño» | 33.C, 4 |
| D | búsqueda de servidor; el componente no filtra lo cargado | 33.D |
| E | la paginación conserva búsqueda y filtros y recibe el total real | 33.E |
| F | los cuatro filtros mínimos, resueltos en servidor | 33.F, 6 |
| F2 | un valor desconocido en la URL se ignora | 6 |
| G | la entidad externa se elige; avisa si ya es cliente o proveedor | 33.G, 7 |
| G2 | no se ofrecen unidades organizativas | 7 |
| H | los colectivos se crean, con ejemplos | 33.H |
| I | primer análisis con pertinencia y justificación obligatoria | 33.I, 9 |
| J | sustituir confirma y explica; no hay botón de editar | 33.J, 9 |
| K | la regla de escritura del dominio, ejecutada en sus tres casos | 33.K, 19 |
| L–M | necesidad y expectativa explícitas, con su explicación | 33.L/M, 10 |
| N | subtipo obligatorio, y solo para el requisito | 33.N, 10 |
| O | convertir pide motivo y confirma; el origen se conserva | 33.O, 10 |
| P | requisito→proceso dentro del requisito, con vigencia | 33.P, 11 |
| Q–R | alcance por vínculos; `strategyScope` ejecutado | 33.Q/R, 13 |
| S | el responsable es un cargo, nunca persona ni texto libre | 33.S, 12 |
| S2 | el seguimiento no presupone encuesta ni cadencia anual | 14, 16 |
| T | lenguaje de producto; ni `ref_kind` ni UUID en pantalla | 33.T, 15 |
| T2 | Voz del cliente y Proveedores se enlazan, no se copian | 14 |
| U–V | «sin cambios» y «se requieren cambios» como opciones reales | 33.U/V, 16 |
| W | el estado de revisión lo calcula el dominio | 33.W, 17 |
| X | modo histórico anunciado, con `role="status"`, sin escritura | 33.X, 19 |
| Y | categoría se desactiva y reactiva; no existe borrado | 33.Y, 20 |
| Z | permisos por capacidad; ningún rol escrito a mano | 33.Z, 24 |
| AA | ningún componente crea cliente de base ni muta | 33.AA, 1 |
| AB | las relaciones centrales no están en el vocabulario periférico | 33.AB, 15 |
| AC | tarjetas en móvil, tabla desplazable, navegación que se ajusta | 33.AC, 25 |
| AD | sin promesas de conformidad; «empresa», no «organización» | 3, 27 |
| AE | etiquetas reales, tabla con título accesible y `scope` | 26 |
| AF | ayuda con el patrón «i», sin la infraestructura administrada | 28 |
| AG | ni tutoriales, ni reglas de automatización, ni proveedor de IA | 29–31 |

---

## 3 · Cableado · `tests/ui/quality-12-3b3a-ux.test.tsx`

| | Qué demuestra |
|---|---|
| AH | sustituir **no envía nada** hasta confirmar, y al confirmar envía con su `assessment_id` |
| AI | cancelar no envía |
| AJ | sin permiso no existe el formulario de sustitución, pero sí se lee |
| AK | convertir exige motivo, confirma, y envía `origin_id` y `rationale` |
| AL | una necesidad no ofrece procesos: todavía no obliga a nada |
| AM | un requisito sí, con su vigencia y su «terminar vínculo» |
| AN | la estrategia multi-requisito envía **dos** `requirement_ids` |
| AO | la estrategia general no envía ninguno |
| AP | el alcance de una estrategia existente se lee de sus vínculos |
| AQ | «Revisado, sin cambios» viaja como `no_changes` |
| AR | «Se requieren cambios» también, y la pantalla dice que el acta no es el cambio |
| AS | en modo histórico no queda **ni un** botón que escriba (los GET de navegación sí) |
| AT | sin permiso la ficha se lee entera y no ofrece escribir |
| AU | con permiso y en el presente, sí deja trabajar |

---

## 4 · Una comprobación de B2 que cambió, y por qué

La comprobación **O** de `test:quality123b2-domain` decía «B2 no creó una sola
pantalla», y era la correcta entonces: aquel encargo prohibía construir interfaz y había
que poder demostrarlo. B3A construyó la interfaz a propósito, así que esa forma caducó:
mantenerla obligaría a borrar la pantalla para que la prueba pasara.

Se sustituyó por la separación que de verdad protegía y que **no** caduca: las tres
capas de B2 no importan React ni componentes, y el dominio sigue sin ser `server-only`.
La prueba lleva escrito el porqué del cambio, para que dentro de un año nadie crea que
se relajó para tapar algo.

---

## 5 · Regresión

| Comprobación | Resultado |
|---|---|
| `npm run test:all` | **EXIT=0** |
| `npm run typecheck` · `npm run lint` · `npm run build` | 0 · 0 errores · 0 |
| `test:quality123` · `test:quality123-rls` | EXIT=0 · EXIT=0 |
| `test:quality123b2-domain` · `-domain-rls` · `-integrations` · `-history` | los cuatro EXIT=0 |
| Migraciones | ninguna nueva; cabecera Local 0150 |

---

## 6 · Discovery rápido de PDF (§32)

El motor universal (`lib/export/registry.ts` + adaptadores) consume **funciones de
`lib/db` que devuelven filas ya mapeadas**, que es exactamente lo que esta capa expone:
`getStakeholderDetail`, `listRequirements`, `listStrategies` y `listReviews` no dependen
de React ni de la petición. Un adaptador de partes interesadas cabría en el registro
existente sin arquitectura nueva.

No se construyó: el contenido del documento —qué secciones, con qué orden y qué se
firma— es justo lo que la validación humana tiene que decidir primero. Cerrarlo en B3B.
