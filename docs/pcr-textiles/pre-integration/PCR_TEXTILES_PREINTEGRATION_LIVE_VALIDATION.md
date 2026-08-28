# PCR / Textiles · Pre-integración · Validación en Staging

> **Staging aplicado.** `0142`–`0146` aplicadas contra
> `qchzkxbnbqeyuxinipln` (`trazaloop-staging-qa`) el 2026-08-28.
> Cabecera remota: **0146**. Cero deriva con Local.
>
> **Production intacta.** Sirve `dpl_G7ShrFNuxpojx4wYnVQpj2dCirHp` desde hace
> diez días, verificado **por dominio** (`vercel inspect https://www.trazaloop.com`),
> no por la lista de despliegues. Es la lección del incidente de 12.2D: la
> lista puede mentir, el dominio no.
>
> **Preview:** https://trazaloop-production-h4rzoa5lu-idendi-latam-s-projects.vercel.app
> · `dpl_Apoy6tewveCwVtkLLEtBiagg1NZV` · `target: preview` · Ready.

---

## 0 · Precondición · treinta segundos, y son obligatorios

**Antes de las ocho pruebas, confirme que el Preview habla con el Staging que
se migró.**

No pude comprobarlo desde aquí: el Preview está detrás del SSO de Vercel y las
variables de entorno vienen enmascaradas al descargarlas. Y sí importa — hay
**dos** proyectos parecidos:

| Proyecto | Ref | Estado |
|---|---|---|
| `trazaloop-staging-qa` | `qchzkxbnbqeyuxinipln` | **el que se migró a 0146** |
| `trazaloop-staging` | `dtrxxqmdweykzncfmahc` | INACTIVE, sigue sin las migraciones |

Si el Preview apunta al segundo, **las ocho pruebas fallarán de forma
confusa**: la interfaz será la nueva y la base la vieja.

**Cómo comprobarlo.** Abra el Preview con su sesión de Vercel, entre a la
aplicación y en las herramientas del navegador mire cualquier petición a
Supabase: el host tiene que ser `qchzkxbnbqeyuxinipln.supabase.co`.

Alternativa sin navegador:

```bash
npx vercel env ls preview | grep NEXT_PUBLIC_SUPABASE_URL
# y abrir su valor en el panel de Vercel
```

**Si apunta al proyecto equivocado: pare.** Corregir la variable en Vercel y
volver a desplegar el Preview; los cambios de variable no afectan a
despliegues ya construidos.

---

## 1 · Qué se verificó y qué no

### Verificado contra Staging

**45 comprobaciones estructurales, 0 fallos**, sobre el volcado del esquema
real:

```bash
npx supabase db dump --project-ref qchzkxbnbqeyuxinipln \
  --schema public --keep-comments -f /tmp/staging.sql
node scripts/verify-schema-dump.mjs /tmp/staging.sql
```

Cubre los doce puntos: instantánea de `evidence_links`, borrado bloqueado,
elegibilidad temporal, `unit_code`, candado de concurrencia textil, metodología
v2, el `CHECK` de `CALCULATION_INCOMPLETE`, inventario de materia prima,
`output_batch_movements`, linaje de corrección, inventario de producto y
aislamiento entre inquilinos.

El verificador **discrimina**: da 45/45 sobre los esquemas de Local y Staging,
y 1/45 sobre un fichero que no es un esquema con estas migraciones. No es un
sello de goma.

### NO verificado contra Staging

**Las cinco suites de comportamiento contra base.** Necesitan las claves de
Staging, que no están en el repositorio y que no busqué. Corren verdes contra
Local —18 · 8 · 15 · 20 · 17— sobre un esquema que el volcado confirma idéntico
al de Staging.

Dicho con precisión: **el esquema de Staging está verificado; su comportamiento
está verificado en un entorno con el mismo esquema.** No es lo mismo, y por eso
lo digo en vez de sumarlo a la cuenta.

Para cerrar esa brecha haría falta ejecutar, con las claves de Staging en el
entorno:

```bash
npm run test:pcr-textiles-01-rls
npm run test:pcr-textiles-scale-rls    # crea 1 200 filas en su propia empresa QA
npm run test:pcr-textiles-03b-rls
npm run test:pcr-textiles-02a-rls
npm run test:pcr-textiles-02b-rls
```

---

## 2 · Fixtures · lo que hay que preparar

Todo en **una sola empresa QA** identificable. Créela primero:

**Empresa:** `QA PT · <su nombre> · 2026-08` — el prefijo `QA PT` es lo que
permite encontrarlo todo después.

Con **Textiles y PCR** activos, salvo el fixture 7, que necesita una empresa
aparte **solo con Textiles**.

| # | Fixture | Para | Cómo |
|---|---|---|---|
| F1 | Evidencia `QA PT vigente` · vence dentro de un año · **Aceptada** | P1, P2, P3 | Evidencias → Nueva |
| F2 | Evidencia `QA PT obsoleta` · venció hace un año · **Aceptada** | P1, P2 | idem |
| F3 | Evidencia `QA PT pendiente` · sin fecha · **Pendiente** | P2 | idem, sin aceptar |
| F4 | Lote de entrada `QA-PT-LE-VIEJO` · recibido **hace dos años** · 100 kg · material postconsumo | P2, P3 | Trazabilidad → Lotes de entrada |
| F5 | Lote `QA-PT-LE-PARCIAL` · 100 kg · con **40 kg consumidos** en una orden | P5 | Lote + orden + consumo |
| F6 | Lote `QA-PT-LE-CALC` · 100 kg · **fracción reciclada 60 %** con procedencia · material postconsumo **con soporte aceptado** | P4 | El campo de fracción está en el lote |
| F7 | Lote `QA-PT-LE-SINFRAC` · 100 kg · **sin fracción** · mismo material con soporte | P4 | idem |
| F8 | Dos órdenes, cada una con **un solo** lote de salida: `QA-PT-LS-CALC` (consume F6) y `QA-PT-LS-INC` (consume F7), 100 kg producidos cada una | P4, P6 | Trazabilidad → Órdenes |
| F9 | Empresa `QA PT Textiles` · **solo Textiles** · un usuario suyo | P7 | Plataforma → Nueva empresa |
| F10 | En `QA PT Textiles`: **25 proveedores** `QA-PT-PROV-01` … `QA-PT-PROV-25` | P8 | Catálogos → Proveedores |

> **F6 y F7 son el corazón de la prueba 4.** La única diferencia entre ellos es
> la fracción declarada. Si los dos calculan igual, algo va mal.

---

## 3 · Las ocho pruebas

Cada una dice **qué no debe ocurrir**. Eso es tan parte del resultado como lo
que sí.

---

### P1 · Vigencia: el presente y la historia

**Ruta:** `/evidences`  ·  **Fixtures:** F1, F2, F4

1. En la lista, `QA PT vigente` dice **«Vigente hasta AAAA-MM-DD»**.
2. `QA PT obsoleta` dice **«Obsoleta desde AAAA-MM-DD»**.
3. Cree una evidencia sin fecha de vencimiento. Dice **«Sin vencimiento
   declarado»**.
4. Vaya a `/traceability/input-batches`, despliegue `QA-PT-LE-VIEJO` y abra
   «Asociar evidencia».
5. **`QA PT obsoleta` aparece en el selector**, porque estaba vigente cuando el
   lote se recibió.

**No debe ocurrir:** que «sin vencimiento» se muestre como obsoleta. Ni que una
evidencia desaparezca del lote antiguo por estar vencida hoy.

**Limpieza:** ninguna.

---

### P2 · El selector solo ofrece lo asociable

**Ruta:** `/traceability/input-batches` → `QA-PT-LE-VIEJO`  ·  **Fixtures:** F1, F2, F3, F4

1. Abra el selector de evidencia del lote.
2. **`QA PT pendiente` NO aparece.**
3. `QA PT vigente` y `QA PT obsoleta` **sí** aparecen.
4. Bajo el selector se lee contra qué fecha se está juzgando y cuántas se
   descartaron.

**No debe ocurrir:** que aparezca una evidencia pendiente o rechazada. Ni que
el texto hable de «hoy» cuando el destino tiene fecha propia.

**Limpieza:** ninguna.

---

### P3 · Cancelar escribe cero; confirmar escribe uno

**Ruta:** la misma  ·  **Fixtures:** F1, F4

1. Elija `QA PT vigente` y pulse **«Asociar evidencia»**.
2. Aparece un diálogo que dice qué, a qué, contra qué fecha, y que **la
   asociación queda como hecho histórico y no se elimina**.
3. Pulse **Cancelar**. **Recargue la página.** No hay ninguna asociación nueva.
4. Repita y pulse **Confirmar**. Ahora sí queda **una**.
5. Repita el mismo par evidencia+lote y confirme otra vez. **Sigue habiendo
   una**, no dos.

**No debe ocurrir:** que cancelar deje rastro. Que confirmar dos veces
duplique. Que exista un botón de eliminar la asociación.

**Limpieza:** la asociación se conserva por diseño. Queda en la empresa QA.

---

### P4 · Contenido reciclado v2

**Ruta:** `/recycled-content/output-batches/<id>`  ·  **Fixtures:** F6, F7, F8

**Caso calculable — `QA-PT-LS-CALC`:**

1. Pulse **«Calcular con metodología v2»**.
2. Resultado **60 %**. La comprobación aritmética: 100 kg consumidos × 0,60 =
   60 kg reciclados sobre 100 kg → 60 %.
3. La ficha dice **«metodología v2»**.

**Caso incompleto — `QA-PT-LS-INC`:**

4. Pulse **«Calcular con metodología v2»**.
5. Sale **«No es posible calcular todavía el contenido reciclado»**, con el
   **código del lote** `QA-PT-LE-SINFRAC` y qué hay que hacer.
6. **No aparece ningún porcentaje.**
7. Declare 45 % en `QA-PT-LE-SINFRAC` y vuelva a calcular: sale **45 %**.
8. El intento incompleto **sigue en el histórico**.

**No debe ocurrir:** un 0 % en el paso 5. Que se presente como error técnico.
Que pida registrar composición manual. Que el cálculo incompleto desaparezca.

**Limpieza:** ninguna. Los cálculos son inmutables por diseño.

---

### P5 · Saldo trazado de materia prima

**Ruta:** `/traceability/input-batches#inventario` y
`/textiles/traceability/inventory`  ·  **Fixture:** F5

1. En PCR, busque el material de `QA-PT-LE-PARCIAL`.
2. **Recibido 100 · Consumido 40 · Disponible 60.** La resta cuadra.
3. El encabezado dice **«Saldo trazado»**, no «Inventario», y debajo que **no
   contempla mermas, devoluciones ni ajustes por recuento**.
4. Las cantidades llevan **kg** visible.
5. En Textiles, si tiene un material recibido en dos unidades, aparece en **dos
   filas**, no sumado.

**No debe ocurrir:** que se llame «inventario» a secas. Que falte el alcance.
Que dos unidades distintas se sumen.

**Limpieza:** ninguna.

---

### P6 · Salida de producto y corrección

**Ruta:** `/traceability/output-batches` → desplegar `QA-PT-LS-CALC`  ·  **Fixture:** F8

1. Antes de registrar nada se lee **«Sin salidas registradas — quedan 100 kg
   según lo producido»**.
2. Registre un **despacho de 40 kg**, referencia `QA-PT-REM-001`.
3. Ahora dice **«Disponible: 60 kg»**.
4. Intente despachar **80 kg**: se rechaza diciendo cuánto queda.
5. **Corrija** el despacho de 40 a **30**, motivo `QA · se pesó mal`.
6. El saldo pasa a **70 kg**.
7. Despliegue «movimientos corregidos»: **el original de 40 sigue ahí**, con su
   motivo de corrección.
8. **No existe ningún botón de eliminar.**

**No debe ocurrir:** que el paso 1 diga «Disponible: 100 kg» sin más. Que
corregir borre el original. Que exista borrado.

**Limpieza:** los movimientos son historial y no se borran. Quedan en la
empresa QA.

---

### P7 · Navegación con Textiles solo

**Fixture:** F9 (empresa `QA PT Textiles`, sin PCR)  ·  **Entre con su usuario**

1. `/textiles` → el menú lateral dice **Trazaloop Textiles**.
2. **Centro de soporte** desde el menú → sigue siendo Textiles.
3. **«Nuevo ticket»** → **sigue siendo Textiles**.
4. Cree el ticket. Al abrirse el recién creado → **sigue siendo Textiles**.
5. Vuelva a `/support` y **filtre** con el formulario → **sigue siendo
   Textiles**.
6. **Datos de empresa** → sigue siendo Textiles. Vuelva.
7. `/textiles/trazadocs` y `/textiles/evidences` → Textiles.
8. **En móvil** (o ventana estrecha): abra el menú desde el encabezado y repita
   los pasos 2 y 3.

**No debe ocurrir:** que en ningún momento aparezca el menú de PCR —Dashboard,
Catálogos, Evidencias, Trazabilidad, Contenido reciclado— ni el distintivo
«NTC 6632 · UNE-EN 15343».

**Limpieza:** el ticket queda; márquelo con `QA PT` en el asunto.

---

### P8 · Paginación y búsqueda

**Ruta:** `/textiles/catalogs/suppliers` en `QA PT Textiles`  ·  **Fixture:** F10

1. La lista muestra **«Mostrando 1–20 de 25»** — el total real, no el de la
   página.
2. Busque `QA-PT-PROV-23`, que está en la segunda página. **Aparece.**
3. Borre la búsqueda, pulse **Siguiente**: salen los cinco restantes, **sin
   repetir** ninguno de la primera.
4. Repita en `/textiles/traceability/input-lots` y `/textiles/evidences`.

**No debe ocurrir:** que la búsqueda solo mire la página visible. Que el total
sea 20. Que una fila salga en dos páginas.

> Las 1 200 filas ya las demostró `test:pcr-textiles-scale-rls` contra base
> real. Aquí solo se valida la experiencia.

**Limpieza:** los 25 proveedores quedan en la empresa QA.

---

## 4 · Limpieza global

Nada es urgente y nada rompe otros datos: todo vive en las dos empresas QA.

Cuando ya no haga falta, y **solo con superadministrador**:

1. `QA PT Textiles` y `QA PT · …` se pueden desactivar desde
   `/platform/organizations`.
2. **No borre** movimientos, asociaciones ni cálculos: son historial por diseño
   y la base lo impide. Desactivar la empresa es la vía.

---

## 5 · Diferidos aceptados · no bloquean

Están documentados como **by design** y no son hallazgos de la validación:

- **v1 conserva su comportamiento histórico.** Sigue activa y calculable.
- **Orden con varios lotes de salida → `CALCULATION_INCOMPLETE`.** Sin
  atribución de consumos a lotes de salida, repartir sería inventarlo.
- **Las trece raíces de PCR permanecen.** El fallo reproducido no estaba ahí.
- **No hay conversión automática de unidades.** Dos unidades distintas son no
  comparables, y esa es la respuesta completa.
- **El inventario refleja solo los movimientos modelados.** Lo que no existe
  como hecho registrable no se estima.

---

## 6 · Registro

| # | Prueba | Resultado | Notas |
|---|---|---|---|
| 0 | Precondición: Preview → `qchzkxbnbqeyuxinipln` | | |
| P1 | Vigencia | | |
| P2 | Selector elegible | | |
| P3 | Cancelar = 0 · Confirmar = 1 | | |
| P4 | v2 calculable e incompleto | | |
| P5 | Saldo de materia prima | | |
| P6 | Salida y corrección | | |
| P7 | Navegación Textiles-only | | |
| P8 | Paginación y búsqueda | | |

**Staging:** `0146` ☐  ·  **Production:** `dpl_G7ShrFNuxpojx4wYnVQpj2dCirHp`, sin tocar ☐
