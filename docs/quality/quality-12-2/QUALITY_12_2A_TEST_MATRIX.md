# QUALITY-12.2A · Qué se comprueba, dónde y con qué

## Las dos suites nuevas

| Suite | Cómo se ejecuta | Resultado |
|---|---|---|
| `test:quality122a` | estática, sin base | **30 ✔ · 0 ✘** |
| `test:quality122a-rls` | base real, sesiones reales | **24 ✔ · 0 ✘** |

`test:quality122a` está registrada en `test:all`. La de base real se ejecuta
aparte, como el resto de suites de RLS del repositorio.

---

## Los diecisiete puntos que el encargo pedía demostrar

| | Qué | Dónde |
|---|---|---|
| **A** | 250/250 guías trasladadas | `A1` · identidades, vigentes y hints cuadran |
| **B** | el resolver vigente devuelve la revisión vigente | `C1` |
| **C** | el resolver histórico devuelve la anterior | `C2` |
| **D** | actualizar crea revisión, no sobrescribe historia | `B2`, `B4` |
| **E** | identidad de sección estable | `A2` estática, `A2` real |
| **F** | el botón «i» de CPR sigue funcionando | `t9g-hint-parity` 7 y 14 |
| **G** | el botón «i» de Textiles sigue funcionando | `t9g-hint-parity` 6 |
| **H** | Demo no recibe guía no autorizada | `D3`, `D4`, `D5`, `D6` |
| **I** | Full sí | `D1` |
| **J** | Extra sí | `D2` |
| **K** | cruce entre empresas imposible | `D7` |
| **L** | acceso por identificador directo imposible | `D4` |
| **M** | la guía nunca se presenta como hecho de la empresa | `E1`, `E4` estáticas · `F2` real |
| **N** | inventario normativo cubierto | `F1`, `F2`, `F3` · documento aparte |
| **O** | el comportamiento documental no cambia | `trazadocs`, `textiles-trazadocs`, `trazadocs-section-hardening` |
| **P** | los PDF no cambian | ver abajo |

---

## `test:quality122a` · lo que se comprueba leyendo el código

**A · Identidad ≠ revisión.** Dos tablas. La identidad usa la terna estable y
**no** contiene `title`, `label`, `locale` ni `sort_order`. Unicidad con
`nulls not distinct`. Los dos alcances, con una restricción que impide una fila
a medias entre ellos.

**B · La historia.** El freno de inmutabilidad cubre los ocho campos de
contenido y las dos operaciones. La única excepción —cerrar— solo funciona una
vez. Una sola revisión abierta por guía. Publicar es de plataforma, cierra
antes de insertar, enlaza después, y no crea revisiones repetidas.

**C · Una sola fuente.** `hint` congelado por trigger. Nadie lo lee: ni
`lib/db/trazadocs.ts`, ni el resolver, ni el tipo estructural. El backoffice
publica revisiones. La puerta antigua se retiró del repositorio.

**D · La regla comercial, dentro de la base.** Se reutiliza
`resolve_organization_module_access`. Solo Full y Extra reciben texto. Sin
pertenencia, excepción. Las tablas no son legibles para los miembros. En Demo
se informa de que hay guía sin entregarla, y el aviso no se guarda en la base.
Fail-closed sin camino de vuelta a la columna congelada.

**E · La guía no es evidencia.** `do_not_invent` existe y lleva la prohibición
de §8. La clasificación es una lista cerrada de cinco valores. Clasificar se
hace al escribir, nunca con un `update` posterior. El tipo que consume la guía
lleva la barrera al lado del texto.

**F · Quality.** Existe la guía por papel de sección, el resolver la expone,
`quality` está admitido como módulo y **no se sembró ningún texto inventado**.

**G · La migración.** La 0136 es la última y va detrás de la 0135. Ninguna
anterior editada. Toda función definer fija `search_path`. Nada para `anon`.
**Y ni una mención a OpenAI, Anthropic o `QUALITY_AI`**: este sprint no toca
esa capa, y la prueba lo vigila.

---

## `test:quality122a-rls` · lo que solo se ve contra una base

**A · El traslado.** 250 identidades y 250 vigentes para 250 hints. Fila a
fila: mismo módulo, misma estructura, misma clave, mismo contenido —salvo las
nueve corregidas, que son exactamente las que están en revisión 2—. Cada
revisión tiene huella de 64 caracteres y no hay dos revisiones de la misma guía
con la misma huella.

**B · La historia, de verdad.** Se monta una estructura de prueba propia —no se
toca el material real—, se publica una revisión, se publica otra, y se
comprueba que la primera quedó cerrada, enlazada y **consultable**. Republicar
lo mismo no añade filas. Reescribir o borrar una revisión publicada falla.

**C · La prueba histórica.** Dos revisiones separadas por una pausa real, y una
marca de tiempo tomada entre ellas:

```
AHORA          → revisión 2 · «Delimite productos, plantas y procesos…»
A FECHA (entre) → revisión 1 · «Indique el alcance del procedimiento…»
```

El resolver no sabe qué revisión debe devolver: lo decide la vigencia. Y la
consulta histórica **no** contiene el texto de hoy.

**D · Demo no puede sacar la guía.** Por la función, por las tres tablas, por
identificador directo, cambiando de módulo en la petición, con peticiones
malformadas —incluida una con SQL dentro—, desde otra empresa y desde el
anónimo. Ocho caminos, ninguno entrega texto.

**E · La columna antigua ya no manda.** Cambiar `hint` falla con un mensaje que
explica por qué. Lo estructural de la sección se sigue pudiendo editar. Un
usuario de empresa no puede publicar guía.

**F · La revisión normativa.** Ninguna guía vigente en riesgo de conformidad o
certificación. Todas las que citan una norma llevan `do_not_invent` con la
prohibición. Las nueve corregidas conservan su revisión 1, cerrada.

---

## Regresión

`npm run test:all` → **EXIT 0**, ejecutada dos veces: antes y después de
reconstruir la base local desde cero (0001…0136).

Suites de compatibilidad verificadas explícitamente: TrazaDocs, TrazaDocs
Textiles, endurecimiento de secciones, lista maestra de documentos, paridad de
hints T9G, acceso Demo a hints, PCR, Textiles, Quality, auth, selector de
módulos y exportaciones.

---

## Sobre los PDF y el despliegue

**Los PDF no cambian.** La guía nunca formó parte del contenido de un
documento: es ayuda de redacción que se muestra junto al campo y no se
serializa en el documento ni en su instantánea. `trazadoc_build_document_snapshot`
copia `section_key`, `title`, `content`, `sort_order` e `is_required` — nunca
el hint. Retirarlo del tipo estructural **refuerza** esa separación en lugar de
cambiarla.

**No se creó Preview, y es una decisión, no un olvido.** Lo que cambió
visualmente es una etiqueta en el backoffice del superadministrador —«Guía de
autoría», con su revisión vigente— y una línea explicativa debajo. El botón
«i» del usuario final tiene **paridad visual exacta**: mismo icono, mismo
panel, mismo aviso en Demo, mismo contenido en Full. Un Preview para validar a
ojo que nada cambió aporta menos que las pruebas que ya demuestran que nada
cambió, y gasta un despliegue.

Cuando 12.2C ponga un botón nuevo delante del usuario, ahí sí hará falta.
