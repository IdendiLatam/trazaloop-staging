# El post-check se ejecuta antes

> Regla de proceso. Nació de una fuga entre inquilinos que estuvo a un comando
> de llegar a Staging.

## La regla

**Todo guion de validación post-migración se ejecuta primero contra una réplica
local limpia que ya tenga aplicadas las migraciones candidatas.** Antes de
tocar ningún entorno remoto.

No es una comprobación más: es el mismo guion, ejecutado antes. Lo que en el
plan figura como «validar después de aplicar» sirve igual de bien —mejor— como
preflight estructural, porque una réplica local con las migraciones puestas es
indistinguible de Staging para todo lo que ese guion mira: columnas,
restricciones, políticas, disparadores, opciones de vista y comportamiento de
las funciones.

### Dónde NO aplica

En lo que depende de datos que solo existen en el entorno remoto: volumen real,
variantes de texto que escribió gente de verdad, contadores de uso, estados de
empresas concretas. Esas comprobaciones siguen siendo posteriores, y forzarlas
antes solo produciría cifras vacías con aspecto de resultado.

La regla es el **defecto para esquema y comportamiento de base de datos**, no un
absoluto.

---

## Por qué existe

En PCR/TEXTILES PRE-INTEGRATION, el guion de validación post-migración se
escribió para correrse contra Staging después de aplicar `0142`–`0146`. Se
ejecutó antes, contra la base local que ya estaba en `0146`, y su comprobación
21 —la que mira `security_invoker` de cada vista— dijo esto:

```
v_latest_batch_recycled      | false
v_textile_input_lot_balance  | false
v_textile_material_inventory | false
```

Las dos primeras lo tenían en `true` desde `0029` y `0078`. Lo habían perdido
al recrearse en este sprint.

`create or replace view` **sin** cláusula `with` no conserva las opciones de la
vista: las **restablece**. Sin `security_invoker`, una vista se ejecuta con los
permisos de su propietario —`postgres`, que tiene `bypassrls`— y la RLS de las
tablas base deja de aplicarse.

Comprobado con una empresa recién creada y cero datos propios:

```
tabla textile_input_lots       → 0 filas   RLS aplica
v_textile_input_lot_balance    → 4 filas   FUGA
v_textile_material_inventory   → 3 filas   FUGA
v_latest_batch_recycled        → 18 filas  FUGA
```

Tres vistas de saldo e inventario devolviendo datos de todas las empresas. Sin
error, sin aviso, y con las tablas subyacentes protegidas correctamente: la
fuga estaba solo en la capa que se creyó inofensiva.

**Las migraciones se aplicaron bien.** Un `db push` verde no habría dicho nada.
Es el caso general del que esta regla protege: *migration success ≠ behavior
correct*.

---

## Qué hacer con lo que encuentre

Si el guion encuentra un defecto en una migración **que todavía no ha salido de
local**, se corrige **en su sitio**. No se añade una migración correctiva para
arreglar algo que nunca se publicó: eso deja en el historial la huella de un
error que no llegó a existir para nadie, y obliga a leer dos ficheros para
entender uno.

La regla de solo-añadir protege lo **publicado**. Mientras el remoto no lo
tenga, el candidato es candidato.

---

## Cómo se ejecuta

```bash
# 1 · Réplica local limpia con las migraciones candidatas aplicadas.
bash scripts/replay-local.sh

# 2 · El guion de post-validación, contra ella.
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  -f docs/<sprint>/qa/POST_MIGRATION_CHECKS.sql

# 3 · Solo entonces, el entorno remoto.
npx supabase db push --project-ref <REF_EXPLÍCITO>

# 4 · Y el mismo guion otra vez, ahora contra el remoto.
psql "$STAGING_DB_URL" -f docs/<sprint>/qa/POST_MIGRATION_CHECKS.sql
```

El paso 4 no sobra: lo que el 2 no puede ver son los datos reales.

---

## Cómo escribir un guion que sirva para las dos cosas

- **Solo lectura.** Ni una fila, ni una tabla temporal. Así se puede correr las
  veces que haga falta y sobre una base con gente trabajando.
- **Una columna `veredicto` por consulta.** Quien lo lee no debería tener que
  interpretar un recuento.
- **Distinguir lo estructural de lo poblacional.** «¿Existe el `CHECK`?» vale
  en las dos ejecuciones. «¿Cuántas filas quedaron sin normalizar?» solo
  significa algo en la segunda.
- **No dar por buena la ausencia de error.** La comprobación 21 no falló:
  devolvió `false` donde tenía que decir `true`. Un guion que solo detecta
  excepciones no habría visto nada.

---

## Lo que la regla no arregla

No sustituye a las pruebas. La fuga la encontró el guion, pero **quien impide
que vuelva** son tres comprobaciones que ahora corren en `test:all`: dos que
leen el SQL de las migraciones y una que cruza la base con una empresa vacía
contra las seis vistas de saldo e inventario.

Un guion que se ejecuta cuando alguien se acuerda es mejor que nada. Una prueba
que se ejecuta siempre es otra cosa.
