# PE-06D1 · La 0136 se paró contra un dato real de Producción

*6 de septiembre de 2026. Producción quedó, y sigue, en **0135**: consistente,
sin migración a medias y sin desplegar.*

---

## Qué pasó

Con la limpieza de inquilinos aceptada y Producción en `0111`, se lanzó la fase 4
del corte: `supabase db push`, 72 migraciones.

Se aplicaron **24** —`0112` a `0135`— y la **0136** abortó:

```
ERROR: new row for relation "trazadoc_authoring_guidance_revisions"
violates check constraint "trazadoc_guidance_revisions_guidance_check"
```

La 0136 se deshizo entera: sus dos tablas no existen y no quedó registrada. **No
hay migración a medias.** Las 24 aplicadas son aditivas —el esquema de Quality—,
y la aplicación desplegada siguió respondiendo con normalidad.

## Por qué

La 0136 mueve `trazadoc_blueprint_sections.hint` a una tabla de guías con
revisiones, y le pone un límite:

```sql
check (length(btrim(guidance)) between 5 and 4000)
```

Ese límite es correcto **para el dato canónico**. Las mismas 250 secciones
existen en los tres entornos, pero su contenido no:

| | Local y Staging | Producción |
|---|---:|---:|
| secciones | 250 | 250 |
| guías distintas de la canónica | 0 | **92** |
| de ellas, de más de 4000 caracteres | 0 | **76** |
| la más larga | 221 | **31 774** |

Las 92 son documentos de markdown que empiezan por `### ¿Qué debe escribir en…`,
con saltos de línea de Windows, de entre 2 983 y 31 774 caracteres. Están ahí
desde el arranque del proyecto, el 25 de julio de 2026, y no se han tocado desde
entonces.

**No salieron de esta cadena de migraciones.** La 0044 es la única que siembra
esa tabla, tiene un solo commit en toda su historia —nunca se reescribió— y ya
traía los textos cortos. Entraron por otra vía al montar el proyecto.

## Lo que decidió producto

```
PRODUCTION_LONG_BLUEPRINT_HINTS_CLASSIFICATION = LEGACY_NON_CANONICAL_BOOTSTRAP_CONTENT
PRODUCTION_LONG_BLUEPRINT_HINTS_ARCHIVAL_REQUIRED = YES
CANONICAL_BLUEPRINT_HINT_SOURCE = MIGRACIONES 0044 Y 0082
MIGRATION_0136_LIMIT_CHANGE = NO
```

No se agranda el límite. No se toca la 0136. No se crea deriva entre entornos. Y
no se tira ese contenido sin guardarlo antes fuera del repositorio.

## El diff completo, no solo las largas

Se compararon **las 250 filas**, casadas por identidad de negocio —código de
plano y clave de sección—, no por identificador ni por orden:

| | |
|---|---:|
| secciones | 250 de 250 |
| identidades que casan | **250** · 0 sobran · 0 faltan |
| diferencias de estructura (título, orden, obligatoriedad, estado, descripción) | **0** |
| guías que coinciden | 158 |
| **guías que difieren** | **92** |
| de ellas, de más de 4000 | 76 |

Las **16 que difieren sin pasar de 4000** son de la misma familia —`###`, saltos
de Windows, entre 2 983 y 3 840 caracteres—: contenido legado que simplemente no
llegaba al límite. La partición es limpia: de las 158 que coinciden, **ninguna**
empieza por `###` y **ninguna** pasa de 4000.

## La autoridad canónica

No se copió de ningún entorno. Se levantó una base desechable aplicando la cadena
hasta `0135` y se comprobó, guía a guía, que **las 250 aparecen literalmente** en
los ficheros de migración: 110 en la `0044` y 140 en la `0082`. Local en `0183`
coincide con ese manifiesto **carácter a carácter**, lo que lo confirma sin ser
la fuente.

## Lo que se guardó antes de tocar nada

Las **250 filas completas** de Producción —no solo las 92—, con su identidad, su
plano, sus fechas y su contenido, en la zona privada de artefactos, con permisos
`600`, fuera de Git y con huella SHA-256 en su índice.

Se pasó por encima un barrido de credenciales **por estructura** —llaves JWT,
`sb_secret_`, tokens de proveedor, URLs con credenciales, cadenas de conexión,
bloques PEM, asignaciones del tipo `api_key=…`, hexadecimales largos— sobre los
tres campos de texto de las 250 filas: **ninguna coincidencia**, y ni un solo
enlace externo.

## Cómo se reconcilia

`scripts/release/pe06/reconcile-production-trazadoc-hints.ts`. Actualiza `hint` y
nada más: **no borra ni una fila, no crea ninguna**, y no toca ningún otro campo.
Las identidades se conservan, así que el `id` de cada sección sigue sirviendo
para todo lo que ya apunte a ella.

Diez puertas, todas a la vez: `--execute`, el proyecto, el manifiesto **con su
huella**, el número de filas que se espera cambiar, la copia previa **con su
huella**, la frase completa, la variable de entorno, y que la base esté en `0135`
con 0 empresas y 250 secciones de estructura idéntica. Todo dentro de una
transacción que se verifica a sí misma antes de confirmar.

## El ensayo, con la forma real del fallo

Sobre una base desechable equivalente a Producción —cabecera `0135`, 0 empresas,
250 secciones— se inyectó el contenido legado real desde la copia privada:

1. **La 0136 falló igual**, con la misma restricción. El ensayo reproduce el
   incidente; sin esto no probaría nada.
2. Las puertas, vistas bloquear una a una: manifiesto con huella equivocada,
   `--execute` sin interruptor, esperar 76 cuando son 92, copia previa que no
   verifica.
3. Reconciliación en seco: 250 secciones, 250 identidades, 0 estructurales, 158
   coinciden, **92 difieren**.
4. Reconciliación real: **92 guías**, 0 filas borradas, 0 creadas.
5. Después: 250 secciones, **0 de más de 4000**, la más larga 221.
6. Y entonces sí, **las 48 migraciones restantes**, `0136` → `0183`: **0 fallos**.

El resultado es idéntico a Local `0183`: **320 tablas y 87 vistas, el mismo
conjunto exacto**, 0 sin RLS, las mismas políticas tabla por tabla, los mismos
800 disparadores, y la 0136 produjo **las mismas 332 revisiones** con la misma
longitud máxima, 296.

*(La base de ensayo tiene 36 funciones más que Local: son `pgcrypto` instalado en
`public` por la copia base sintética, no esquema de la aplicación. No falta
ninguna.)*

## Lo que queda para después

```
LEGACY_TRAZADOC_GUIDANCE_CONTENT_REVIEW = BACKLOG
```

Los 92 documentos archivados **no son basura**: simplemente no son el valor
canónico de `hint`. Si algún día alguien decide que ese material sirve —como guía
versionada, como ayuda contextual, como FAQ—, ahí está, íntegro y con su huella.
Esa curaduría **no se resuelve durante un corte a Producción**.
