# PE-04B2 · Reconocer antes de escribir

Migrar sin haber contado es como limpiar sin haber inventariado. La lección es
de PE-03B5 y aquí vuelve a aplicarse.

---

## 1 · La herramienta

`scripts/pe04b2/reconocimiento.sql` — **solo lectura**. Se ejecuta antes de
aplicar 0163 a un entorno y responde cuatro preguntas.

```
psql "$PG" -X -f scripts/pe04b2/reconocimiento.sql
```

Y la vista `v_commercial_migration_recognition` deja la misma clasificación
disponible fila a fila, para mirar un caso concreto.

---

## 2 · Lo que salió en la base local

```
-- EMPRESAS Y MODULOS --
 empresas | filas_modulo_funcional
       24 |                     72

-- CLASIFICACION POR MODULO --
 categoria      | filas | empresas
 extra          |     2 |        2
 full           |    22 |       10
 prueba_vencida |    14 |        6
 prueba_vigente |    34 |       12

-- DESACUERDO ENTRE LAS DOS FUENTES VIEJAS --
 en_desacuerdo | total
            24 |    72

-- EMPRESAS CON MEZCLA DE PLANES ENTRE MODULOS --
 empresas_con_mezcla
                   4
```

**`sin_clasificar` = 0.**

Las 24 filas en desacuerdo son el defecto de PE-04A medido otra vez: los módulos
dicen una cosa y la suscripción legacy otra. Y las 4 empresas con mezcla son la
razón por la que el modelo admite ámbito de módulo.

---

## 3 · Por qué «sin clasificar» no puede ser otra cosa que cero

No es solo una observación: es **estructural**.

```sql
CHECK (access_mode = ANY (ARRAY['demo', 'full', 'extra']))
```

`organization_modules.access_mode` solo admite tres valores, y la clasificación
cubre los tres más «deshabilitado». El `else 'sin_clasificar'` existe por
higiene —para que un valor nuevo salte a la vista el día que alguien amplíe la
restricción— y hoy es inalcanzable.

Se comprueba igualmente, porque una garantía que nadie mide es una creencia.

---

## 4 · La clasificación, y a dónde va cada una

| Categoría | Qué es | A dónde migra |
|---|---|---|
| `extra` | Módulo en Extra | Base Free **+** asignación Extra permanente |
| `full` | Módulo en Full | Base Free **+** asignación Full permanente |
| `prueba_vigente` | Demo con fecha futura | Base Free **+** concesión con **su misma fecha** |
| `prueba_vencida` | Demo caducado | **Solo** base Free |
| `deshabilitado` | Módulo apagado | Base Free · sigue apagado por el acceso legacy |

La cuarta es la mejora que este tramo trae: hoy una empresa con la prueba
vencida está comercialmente muerta; mañana tiene Free.

---

## 5 · Lo que la clasificación NO mira

**La suscripción legacy.** Aparece en la vista solo para poder **medir** el
desacuerdo; no participa en decidir a dónde va nadie.

Es la regla que T9F.1 dejó escrita y que este tramo hace definitiva: la
autoridad real es `organization_modules.access_mode` más la vigencia de su
prueba. Leer la suscripción para clasificar habría propagado el defecto a la
migración.

---

## 6 · Staging

**Los números de Staging no se produjeron.** El guion está y es de solo lectura,
pero ejecutarlo necesita credenciales de base que no viven en el repositorio y
que este agente no ha ido a buscar — la misma instrucción permanente que rige
desde PE-03B3.

Lo que sí se puede afirmar sin ellos:

- **`sin_clasificar` no puede ser distinto de 0**, por la restricción de la
  columna (§3);
- la migración deriva de `access_mode`, que existe en Staging con los mismos
  tres valores posibles;
- y es **idempotente**: si algo hubiera que repetir, repetir no duplica.

Para producir el informe:

```
psql "$STAGING_DB_URL" -X -f scripts/pe04b2/reconocimiento.sql
```
