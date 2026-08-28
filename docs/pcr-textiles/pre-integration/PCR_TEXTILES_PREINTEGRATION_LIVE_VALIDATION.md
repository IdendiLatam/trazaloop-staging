# PCR / Textiles · Pre-integración · Aplicación en Staging y validación humana

> **Nada de esto se ejecutó.** No hay autenticación remota de Supabase
> disponible en este entorno —no existe `~/.supabase/access-token` ni ningún
> `project-ref` persistente— y no se buscó ninguna. Los comandos están escritos
> para que los ejecute una persona.
>
> **Production no se toca.** Ningún comando de este documento apunta a ella.

---

## 1 · Antes de nada

El repositorio debe seguir **sin vínculo persistente** de Supabase. Toda
operación remota lleva su `--project-ref` explícito: sin vínculo, ningún
comando puede acertar por defecto contra el proyecto equivocado.

```bash
# Comprobar que NO hay vínculo. Debe salir vacío.
ls supabase/.temp/ | grep -E 'project-ref|linked-project' || echo "sin vínculo: correcto"

# Y que la rama y la cabecera local son las esperadas.
git branch --show-current            # feature/pcr-textiles-pre-integration
ls supabase/migrations | tail -5     # …0146_output_batch_movements.sql
```

---

## 2 · Aplicar las migraciones en Staging

`supabase db push` **no puede** con la 0105 —usa `LOCK TABLE` fuera de
transacción— pero eso solo afecta a una reejecución desde cero. Para aplicar
las cinco nuevas sobre una base que ya está en 0141, `db push` sirve.

```bash
STAGING_REF=qchzkxbnbqeyuxinipln

# 1 · Ver QUÉ se va a aplicar, sin aplicar nada.
npx supabase migration list --project-ref "$STAGING_REF"

# 2 · Aplicar. Debe subir 0142, 0143, 0144, 0145 y 0146 y nada más.
npx supabase db push --project-ref "$STAGING_REF"

# 3 · Confirmar la cabecera.
npx supabase migration list --project-ref "$STAGING_REF" | tail -8
```

**Si algo falla a mitad**, cada migración se aplica en su propia transacción:
la que falle no deja nada a medias. Las reversiones están en
[MIGRATIONS](./PCR_TEXTILES_PREINTEGRATION_MIGRATIONS.md), una por migración.

### Lo que hay que mirar después de aplicar

```sql
-- El backfill de unidades: cuántas filas se normalizaron y cuántas no.
-- Lo que quede en NULL es lo que no se pudo normalizar sin adivinar.
select 'textile_input_lots' t,
       count(*) total,
       count(unit_code) normalizadas,
       count(*) - count(unit_code) sin_normalizar
  from textile_input_lots
union all select 'textile_order_consumptions', count(*), count(unit_code),
       count(*) - count(unit_code) from textile_order_consumptions
union all select 'textile_output_lots', count(*), count(unit_code),
       count(*) - count(unit_code) from textile_output_lots
union all select 'textile_production_orders', count(*), count(unit_code),
       count(*) - count(unit_code) from textile_production_orders;

-- Las variantes de texto que NO se normalizaron. Es la lista de trabajo.
select unit, count(*) from textile_input_lots
 where unit_code is null and unit is not null group by 1 order by 2 desc;

-- Que ningún cálculo histórico se tocó: todos deben ser v1 y 'calculated'.
select methodology_version, result_state, count(*)
  from recycled_content_calculations group by 1, 2;

-- Que ninguna asociación legacy fingió confirmación.
select count(*) filter (where confirmed_at is null) as legacy,
       count(*) filter (where confirmed_at is not null) as confirmadas
  from evidence_links;
```

**Lo que estas consultas tienen que decir:** `methodology_version` todo `1` y
`result_state` todo `calculated` (nada se recalculó), y `confirmadas = 0` justo
después de aplicar (nadie ha confirmado todavía).

---

## 3 · Preview

Solo si hace falta para la validación visual y **con el mecanismo guardado por
`deploy-safety`**.

```bash
# NUNCA --prod=false. Es una bandera booleana: el `=false` no la apaga.
npx vercel --target=preview --yes

# Confirmar el SHA que sirve la vista previa antes de validar nada.
npx vercel inspect <URL_DEL_PREVIEW> | grep -i 'commit\|sha'
```

Los alias de Production **no se tocan**.

---

## 4 · Ocho pruebas humanas

Solo lo que las pruebas automáticas **no** pueden cubrir: percepción, lenguaje
y flujo. Todo lo demás está en la
[matriz](./PCR_TEXTILES_PREINTEGRATION_TEST_MATRIX.md).

Cada una tiene un resultado esperado literal. Si algo no coincide, es un fallo.

---

### H1 · Vigente / obsoleta en el catálogo de evidencias

**Dónde:** `/evidences`
**Preparación:** una evidencia con «Vigente hasta» en el pasado y otra sin fecha.

1. La vencida dice **«Obsoleta desde AAAA-MM-DD»**.
2. La que no tiene fecha dice **«Sin vencimiento declarado»** — no «obsoleta».

> Lo que se valida es que «sin fecha» y «vencida» **no se confundan**. Son el
> caso mayoritario y el caso de riesgo.

---

### H2 · El selector solo ofrece lo asociable

**Dónde:** `/evidences` → «Asociar evidencia»
**Preparación:** una evidencia aceptada, una pendiente y una vencida hace años.
Un lote de entrada recibido hace más de un año.

1. Con destino **Proveedor**: la pendiente **no aparece**.
2. Cambiar a **Lote de entrada** y elegir el lote antiguo.
3. La evidencia vencida **sí aparece** si estaba vigente cuando llegó el lote.
4. Debajo del selector se lee cuántas se descartaron y contra qué fecha.

> Es la prueba de PT-F02/F03 vista por una persona: una evidencia obsoleta hoy
> puede seguir amparando una operación de cuando estaba vigente.

---

### H3 · Confirmar y cancelar

**Dónde:** el mismo formulario.

1. Elegir evidencia y destino, pulsar **«Asociar evidencia»**.
2. Aparece un diálogo que dice **qué** se va a asociar, **a qué**, y contra qué
   fecha se juzgó.
3. Pulsar **Cancelar**. Recargar la página: **no debe haber ninguna asociación
   nueva**.
4. Repetir y pulsar **Confirmar**. Ahora sí queda registrada.

> Cancelar tiene que escribir **cero**. Es PT-F05 y no se puede probar mirando
> la base: hay que pulsar el botón.

---

### H4 · Cálculo v2 y el incompleto

**Dónde:** `/recycled-content`
**Preparación:** un lote de salida cuya orden consuma un material elegible con
soporte, **sin** fracción reciclada declarada.

1. Calcular. El resultado es **`incomplete`** con el motivo «fracción no
   declarada».
2. **No aparece ningún porcentaje.** Ni 0, ni 100, ni el del cálculo anterior.
3. Declarar la fracción en el lote de entrada (p. ej. 60) con su procedencia.
4. Volver a calcular. Ahora sale **60 %**.
5. El cálculo incompleto **sigue en el histórico**: no se borró.

> Es la decisión PT-H02 vista de frente. Si el paso 1 devuelve un número, el
> sprint falló en lo principal.

---

### H5 · Saldo trazado de materia prima

**Dónde:** `/traceability/input-batches#inventario` y
`/textiles/traceability/inventory`

1. En PCR se lee **«Saldo trazado»**, no «Inventario», y debajo dice que **no
   contempla mermas, devoluciones ni ajustes**.
2. En Textiles, un material recibido en dos unidades distintas aparece en **dos
   filas**, no sumado.
3. Buscar un material por nombre: la búsqueda encuentra también los que no
   están en la primera página.

> La 2 es la que importa: sumar 300 kg con 40 m daría 340 de nada.

---

### H6 · Salida de producto y corrección

**Dónde:** `/traceability/output-batches` → desplegar un lote

1. Antes de registrar nada se lee **«Sin salidas registradas — quedan X kg
   según lo producido»**, no «Disponible: X».
2. Registrar un despacho de la mitad. Ahora sí dice **«Disponible»** con la
   mitad.
3. Intentar despachar más de lo que queda: se rechaza diciendo cuánto hay.
4. **Corregir** ese despacho a una cantidad menor, con motivo.
5. El saldo se ajusta, y desplegando «movimientos corregidos» **el original
   sigue ahí** con su cantidad y su motivo de corrección.
6. **No existe ningún botón de eliminar.**

> El paso 1 es toda la diferencia entre medir y suponer.

---

### H7 · Navegación entre módulos

**Preparación:** una empresa **solo con Textiles**.

1. Entrar y abrir **Centro de soporte** desde el menú.
2. Pulsar **«Nuevo ticket»**.
3. El menú lateral sigue siendo el de **Textiles** en todo momento.
4. Filtrar los tickets con el formulario de arriba: **sigue siendo Textiles**.
5. Crear un ticket: al abrirse el ticket recién creado, **sigue siendo
   Textiles**.

> El paso 2 es la cadena reproducida en Fase 1. Los pasos 4 y 5 son los dos que
> el Design Freeze no había visto.

---

### H8 · Paginación y búsqueda en Textiles

**Dónde:** `/textiles/catalogs/suppliers`

1. La lista muestra **«Mostrando 1–20 de N»** con el **total real**.
2. Buscar un proveedor que esté al final del alfabeto: **aparece**.
3. Pasar a la última página con «Siguiente»: no se repiten ni faltan filas.

> Con menos de veinte proveedores esta prueba no demuestra nada. Hace falta una
> empresa con volumen; si no la hay en Staging, se cubre con
> `test:pcr-textiles-scale-rls`, que crea 1 200 filas reales.

---

## 5 · Qué NO hace falta probar a mano

Cubierto por completo por SQL o pruebas automáticas:

- la carrera de concurrencia en Textiles y en despachos;
- el corte de las mil filas de PostgREST;
- que un `incomplete` no pueda llevar número (lo impide un `CHECK`);
- que un movimiento no se pueda borrar;
- que v1 siga calculando igual;
- el aislamiento entre empresas;
- que las filas legacy no finjan confirmación.

---

## 6 · Registro de la validación

| # | Prueba | Resultado | Notas |
|---|---|---|---|
| H1 | Vigente / obsoleta | | |
| H2 | Selector de evidencia elegible | | |
| H3 | Confirmar y cancelar | | |
| H4 | Cálculo v2 e incompleto | | |
| H5 | Saldo de materia prima | | |
| H6 | Salida de producto y corrección | | |
| H7 | Navegación entre módulos | | |
| H8 | Paginación y búsqueda | | |

**Migraciones aplicadas en Staging:** ☐ `0142` ☐ `0143` ☐ `0144` ☐ `0145` ☐ `0146`
**Cabecera de Staging tras aplicar:** ______
**Production:** sin tocar ☐
