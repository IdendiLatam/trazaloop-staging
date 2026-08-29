# PCR / Textiles · Pre-integración · Informe de implementación

> Rama `feature/pcr-textiles-pre-integration` · migraciones `0142`–`0146` ·
> `test:all` EXIT 0 · reejecución limpia 0001→0146 con 0 fallos ·
> **Production nunca se tocó.**

Base: [Discovery](./PCR_TEXTILES_PREINTEGRATION_DISCOVERY.md) ·
[Design Freeze](./PCR_TEXTILES_PREINTEGRATION_DESIGN_FREEZE.md) ·
[Migraciones](./PCR_TEXTILES_PREINTEGRATION_MIGRATIONS.md) ·
[Matriz de pruebas](./PCR_TEXTILES_PREINTEGRATION_TEST_MATRIX.md)

---

## 1 · Qué tenían en común los cinco bloques

Casi todo lo que se arregló era la misma clase de fallo: **una respuesta
correcta e incompleta que en pantalla no se distingue de una completa.**

- El filtro de evidencias no encontraba lo que existía, porque el formulario
  escribía en otro vocabulario.
- Las listas textiles enseñaban mil filas de mil doscientas, sin error.
- Los contadores de referencias y de vínculos daban un número equivocado, que
  es peor que una lista corta: una lista corta se nota.
- La guarda de sobreconsumo textil dejaba pasar sin comprobar cuando las
  unidades no coincidían.
- El porcentaje reciclado afirmaba con cuatro decimales lo que no podía
  defender.
- Un lote vendido entero figuraba disponible para siempre.

Ninguno daba error. Todos parecían funcionar.

---

## 2 · PT-03A · El shell deja de volver a PCR por su cuenta

La Fase 1 reprodujo la cadena y **exoneró a las trece raíces de PCR**: el fallo
no estaba ahí. El módulo activo viaja por las pantallas transversales en `?m=`,
y había pantallas que lo soltaban en su propio enlace interno. Dos clics:

```
barra lateral   →  /support?m=textiles    shell Textil ✓
«Crear ticket»  →  /support/new           shell PCR    ✗
```

**Tres cosas que el Design Freeze no había visto.** El formulario GET de
filtros también lo perdía —un submit envía solo sus campos—. El salto tras
crear un ticket lo perdía en `router.push`. Y tres de las seis pantallas que la
Fase 1 listó viven **fuera** de `(shell)`: no pintan barra lateral, así que por
ahí no puede escaparse ninguna identidad. Añadirles el patrón habría sido
ceremonia; quedan documentadas como «no lo necesitan».

La prueba dejó de ser una lista escrita a mano y **recorre `(shell)`**: toda
página transversal que encuentre debe resolver el módulo y decorar sus enlaces.
Así la próxima que alguien añada entra sola en la comprobación.

**No se migraron las raíces de PCR** (PT-F17). Sin fallo reproducido ahí, no
hay refactor.

---

## 3 · PT-01 · La evidencia guarda por qué valía

### 3.1 · El tipo, desde un solo sitio

`evidences.evidence_type` se alimentaba desde dos formularios con dos
vocabularios —texto libre y lista cerrada— y el filtro usaba la lista. Toda
evidencia creada por el camino normal era invisible al filtro.

La lista canónica **no se amplía**: este sprint unifica de dónde sale, no qué
contiene. Los valores legacy se muestran tal cual y marcados; solo se traducen
alias inequívocos. `record` no entra: podría ser de recepción, de control o de
producción, y elegir sería inventarse el dato de otra persona.

Textiles conserva su `CHECK` de 13 valores. Se unifica **la forma** —código
estable + etiqueta— no la lista: son dominios distintos.

### 3.2 · La verdad histórica

`guard_evidence_review` borra `reviewed_at`/`by`/`comment` al reabrir una
rechazada. La fila no sabe su historia de aprobación. Seis columnas en
`evidence_links` congelan la razón junto al hecho: la fecha del destino contra
la que se juzgó, el estado y la vigencia aceptados, quién confirmó y por qué.

No se copia el archivo ni el nombre: un snapshot que copia de más es un segundo
documento disfrazado.

**La puerta de atrás se cerró.** Se retiró la política de `insert`: sin eso,
`evidence_link_confirm` sería una recomendación.

### 3.3 · La vigencia: dos preguntas distintas

El catálogo mira **hoy** (PT-F01). La aplicabilidad mira **la fecha del lote**
(PT-F02). Una evidencia hoy obsoleta sigue amparando un lote recibido cuando
estaba vigente, y eso hace que PT-F03 y PT-F04 salgan gratis: la regla es la
ausencia de `now()`.

`valid_until` es **inclusivo**, y la misma semántica rige en la base, el
dominio y las pruebas.

### 3.4 · Archivar

Deja de ofrecerse en PCR y en Textiles. No se elimina `archived_at`, ni las
filas archivadas, ni la acción de servidor. Se conserva «Desarchivar» cuando la
fila ya lo está: quitar también la salida dejaría atrapado para siempre lo
anterior al sprint.

### 3.5 · La escala

Once pantallas textiles pasan a una página con su total al lado. Las lecturas
completas —selectores, exportadores— recorren por lotes y **lanzan** si no
pueden terminar: entre romper la pantalla y entregar un desplegable al que le
faltan opciones, este sprint rompe la pantalla.

**Dos cosas aparecieron por el camino.** `evidence_links_uniq` es único sobre
cuatro columnas y PostgreSQL trata los `NULL` como distintos: con `link_role`
nulo, `on conflict` no dispara nunca y cada reconfirmación habría duplicado. Y
un builder de Supabase no es reutilizable: aplicarle `.range()` dos veces
sobrescribe el rango, así que el recorrido habría devuelto la primera página en
bucle. Hay una prueba que lo exige.

---

## 4 · PT-03B · La unidad y el candado

`guard_textile_lot_overconsumption` comparaba **solo si las cadenas
coincidían**; si no, pasaba sin comprobar. La desigualdad de unidades abría la
puerta. Y faltaba el `for update` que PCR tiene desde 0105.

`unit_code` nullable junto al texto original, que se conserva. **No se
reutilizó `UNIT_CODES` de los indicadores**: se reutiliza su postura —«jamás
transformación del valor»— y sus códigos donde coinciden, pero aquella lista
tiene `cop`, `usd` y `celsius`, que en el selector de un rollo de tela no
significan nada.

**Cero conversión**, ni kg↔g. Hay una prueba que falla si aparece un factor.
`other` es canónico pero no computable: dos cantidades en «other» pueden ser
rollos y docenas.

**Sin fecha de corte** (PT-H04). La regla es estructural: una fila con
`unit_code` se comprueba, una sin él no puede comprometer saldo. Las filas
legacy que ya coincidían por texto siguen funcionando.

---

## 5 · PT-02A · El porcentaje y el saldo

### 5.1 · PT-H05, resuelto antes de escribir

Tres hechos del esquema: `batch_consumption` no tiene columna que ate un consumo
a un lote de salida; nada obliga a que dos lotes de la misma orden declaren la
misma composición; `v_traceability_backward` ya atribuye todos los consumos a
cada lote de salida —asume homogeneidad sin exigirla—.

**Caso B.** No se prorratea. Una orden con un lote de salida se calcula; con
varias sale `incomplete`, y el dato que faltaría queda nombrado.

### 5.2 · La fórmula

```
%R = Σ(consumo_i × φ_i) / Σ(consumo_i) × 100
```

El denominador sale de `batch_consumption`, no de una composición tecleada
(PT-F10). El reproceso interno entra al denominador con φ = 0, que es lo que
v1 hacía a través de la clasificación `internal_same_process`.

### 5.3 · φ demostrable (PT-H02)

La fracción vive en el **lote de entrada**, no en el material: un mismo
proveedor entrega en marzo al 60 % y en julio al 45 %. Y exige decir en qué se
apoya.

Los ceros son de **regla** y cada uno se puede nombrar. `other` no resuelve a
cero porque no demuestra nada. Y una clasificación elegible **sin fracción
declarada ya no vale 100 %**.

> **La consecuencia, dicha en voz alta.** v2 devolverá `incomplete` mucho más a
> menudo de lo que v1 devuelve un número, y seguirá haciéndolo hasta que las
> empresas declaren la fracción de sus lotes. No es un defecto: es lo que se
> pidió. Un porcentaje que no se puede defender no es un porcentaje más flojo,
> es una afirmación sin respaldo.

### 5.4 · La garantía es del `CHECK`

Copiando el patrón que `quality_measurements` ya tiene probado: un `incomplete`
no puede llevar porcentaje y un `calculated` no puede venir sin él. Se prueba
saltándose el código, con un `insert` directo.

### 5.5 · v1 (PT-H01, PT-H03)

Intacta. Su función, su fila de metodología y todos sus cálculos siguen ahí y
siguen siendo reproducibles con su propio snapshot. Un cálculo emitido es
inmutable y rechazar una evidencia después **no lo reescribe**: el recálculo
posterior sí lo refleja; el histórico, no.

### 5.6 · Saldo de materia prima

PCR **no se rehace**: la vista, la búsqueda y la paginación de 0105 ya hacían
lo que PT-F12 pide. Faltaba decir el alcance y hacer visible la unidad. Se deja
de llamar «inventario» a lo que es un saldo trazado.

Textiles lo gana, agrupando por **(material, unidad)**. El saldo negativo se
muestra, no se recorta. Los consumos que no se pudieron restar se cuentan y se
dicen.

---

## 6 · PT-02B · El producto terminado

Primero **se deja de mentir**: la pantalla deja de presentar producción menos
reproceso como «Disponible», y cuando un lote no tiene ningún movimiento
registrado lo dice.

`output_batch_movements`: cuatro clases, cantidad siempre positiva —el signo lo
lleva `direction`—, cuándo **pasó**, motivo cuando se pierde o se ajusta, y una
referencia de texto libre. Ni pedidos, ni clientes, ni facturas, ni almacenes:
hay una prueba que falla si aparece cualquiera de esas palabras.

Corregir **inserta**; el original se conserva marcado como no vigente. Borrar
está bloqueado por dos capas.

**Dos cosas salieron al probarlo.** La corrección se rechazaba a sí misma: el
último `UPDATE` del original volvía a disparar la guarda, que contaba la
corrección recién insertada como «otras salidas». Y el `DELETE` por sesión de
usuario **no da error** —la RLS no alcanza la fila y PostgREST devuelve éxito
habiendo afectado a cero—: la prueba se corrigió para comprobar que la fila
sigue, no que hubiera error.

---

## 7 · Riesgos conocidos

| Riesgo | Alcance | Mitigación |
|---|---|---|
| **v2 devuelve `incomplete` casi siempre al principio** | alto y esperado | v1 sigue activa y calculable; el defecto de la interfaz no se cambió |
| **Consumos textiles rechazados por unidad sin normalizar** | medio, visible | el mensaje dice exactamente qué arreglar; el texto original se conserva |
| **`readAllStrict` lanza en vez de truncar** | bajo | solo salta con error de PostgREST o >100 000 filas |
| **Revertir 0146 tras registrar movimientos pierde datos** | bajo | documentado en la migración |
| **La política de `insert` de `evidence_links` ya no existe** | bajo | cualquier código futuro que inserte a mano fallará en pruebas, no en producción |

---

## 8 · Comportamiento legacy: qué NO cambió

- Ningún `UPDATE` ni `DELETE` sobre datos existentes en las cinco migraciones.
- Los tipos de evidencia legacy se muestran tal cual, sin reescribir.
- Los enlaces de evidencia anteriores a 0142 quedan sin confirmación **y se
  leen así**.
- El texto de unidad original se conserva en todas las filas.
- Los cálculos v1 conservan su número, su metodología y su snapshot.
- Las evidencias ya archivadas siguen archivadas y se pueden desarchivar.
- `v_output_batch_inventory` sigue existiendo y midiendo lo que siempre midió.

---

## 9 · Lo que este sprint NO hizo

- **No migró las trece raíces de PCR** a `/pcr/**` (PT-F17).
- **No cambió el defecto de la interfaz a v2**: v1 y v2 conviven para poder
  compararlas sobre los mismos datos antes de decidir.
- **No tocó Production.**
- **No aplicó nada en Staging**: no hay autenticación remota disponible y no se
  buscó ninguna. Los comandos exactos están en
  [LIVE_VALIDATION](./PCR_TEXTILES_PREINTEGRATION_LIVE_VALIDATION.md).
- **No modeló la atribución de consumos a lotes de salida**, que es el dato que
  haría calculable una orden con varias salidas.

---

## CIERRE · 2026-08-29

**Validación humana P1–P8: PASS.** Blockers 0 · product gaps 0.
Cabecera 0148 · Local 0148 · Staging 0148 · Production 0111 (sin tocar).

El resumen final, las nueve decisiones congeladas y lo diferido están en
[PCR_TEXTILES_PREINTEGRATION_CLOSURE.md](./PCR_TEXTILES_PREINTEGRATION_CLOSURE.md).
