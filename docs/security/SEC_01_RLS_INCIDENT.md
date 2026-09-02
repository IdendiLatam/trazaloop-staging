# SEC-01 · Siete catálogos de Quality sin RLS

## Qué pasó

El Security Advisor de Supabase reportó `rls_disabled_in_public` en Staging.
Reproducido en local sin tocar Staging: **siete tablas base de `public` con
`relrowsecurity = false` y `relforcerowsecurity = false`**.

El correo del proveedor es genérico y sugiere que `anon` podría editar o
borrar. **No era el caso**, y decirlo así habría sido exagerar el incidente. La
exposición real, medida con identidades reales:

| Rol | Antes del arreglo |
|---|---|
| `anon` | **ningún privilegio** sobre las siete → sin sesión ya se denegaba |
| `authenticated` | `SELECT` y nada más — ni `INSERT`, ni `UPDATE`, ni `DELETE` |

De modo que el riesgo demostrado es exactamente uno:

> **Cualquier cuenta autenticada podía leer las siete tablas completas.**
> Comprobado con una cuenta recién creada, sin empresa y sin rol: leyó
> 26 + 25 + 21 + 26 + 97 + 22 + 15 filas.

Ninguna de las siete tiene `organization_id`: **no hay datos de cliente
expuestos ni lectura cruzada entre empresas**.

## Cómo se llegó aquí

Las migraciones que las crearon **sí cuidaron los privilegios**. 0129, por
ejemplo, hace `revoke all ... from anon, authenticated` y después
`grant select ... to authenticated`. Lo que faltó fue una sola línea:
`enable row level security`.

Es un fallo instructivo: quien lo escribió pensó en los `grant` y no en la RLS,
y como los `grant` estaban bien ajustados, el resultado *parecía* correcto. Sin
RLS, un `grant` es acceso efectivo; con RLS puesta y sin política, el mismo
`grant` es inerte. La diferencia no se ve leyendo los `grant`.

## Las siete, clasificadas

| Tabla | Migración | Clase | `organization_id` | ¿La necesita un usuario normal? |
|---|---|---|---|---|
| `quality_automation_sources` | 0129 | catálogo global de producto | no | **sí** |
| `quality_automation_source_fields` | 0129 | catálogo global de producto | no | **sí** |
| `quality_automation_rule_templates` | 0129 | catálogo global de producto | no | **sí** |
| `quality_automation_event_catalog` | 0131 | catálogo global de producto | no | **sí** |
| `quality_automation_event_contracts` | 0131 | catálogo global de producto | no | **sí** |
| `quality_management_review_input_catalog` | 0128 | catálogo global de producto | no | **sí** |
| `quality_ai_sources` | 0132 | **configuración interna de plataforma** | no | **no** |

### Los seis catálogos globales

Son el vocabulario del producto: qué fuentes y campos existen para construir una
regla de automatización, qué eventos hay, qué plantillas se pueden instanciar y
qué entradas exige la revisión por la dirección (ISO 9001 §9.3.2). Los consume
`lib/db/quality-automation.ts` y `lib/db/quality-management-review.ts` con la
sesión de quien pregunta, y también tres vistas `security_invoker`
(`v_quality_signal_overview`, `v_quality_automation_rule_overview`,
`v_quality_management_review_input_status`), que corren con esa misma identidad.

Quitarles la lectura habría roto Quality **sin cerrar ningún riesgo**: no hay
nada de ninguna empresa dentro. Así que la lectura se conserva —pero pasa a
estar **declarada**, que era justo lo que faltaba.

### `quality_ai_sources`, que es otra cosa

Contiene las 26 fuentes que Intelligence puede consultar con su **clase de
privacidad** (`open`, `people`, `anonymous`, `restricted`), su modo temporal y
la **nota de permiso** de cada una: «sin identidad, nunca», «las notas
restringidas quedan fuera», «se cita el CARGO, nunca la persona que lo ocupa».

Lo que **no** contiene, comprobado columna a columna: ni prompts, ni proveedor,
ni modelo, ni coste, ni URLs internas — los `deep_link` son rutas del propio
producto.

Aun así es el diseño interno de privacidad del Copilot, no vocabulario que el
cliente necesite. Y **no lo consume nadie**: `listAiSources` no tiene un solo
llamante en el repositorio, ninguna vista lo referencia, y la única función que
lo lee —`quality_ai_add_reference`— es `security definer` y corre como
propietario. Lo que ve quien pregunta sale de `quality_ai_run_references`, que
guarda su propia copia de etiqueta y enlace.

Cerrarlo no rompe nada y cierra una filtración de diseño interno.

## Qué se aplicó · migración 0165

**Patrón A · catálogo global autenticado** (los seis):

```sql
alter table … enable row level security;
create policy …_read on … for select to authenticated using (true);
revoke insert, update, delete, truncate on … from authenticated, anon;
revoke all on … from anon;
grant select on … to authenticated;
```

Sin política de escritura: aunque alguien concediera el privilegio por
costumbre en el futuro, `authenticated` seguiría sin poder escribir.

**Patrón B · catálogo interno de plataforma** (`quality_ai_sources`):

```sql
alter table … enable row level security;
create policy …_staff_read on … for select to authenticated using (is_platform_staff());
revoke insert, update, delete, truncate on … from authenticated, anon;
revoke all on … from anon;
```

Nota sobre el privilegio: **no** se revoca el `SELECT` de `authenticated`, y es
deliberado. El personal de plataforma se autentica con ese mismo rol; quitarlo a
nivel de rol se lo quitaría también a ellos. El mínimo privilegio correcto aquí
es conservar el `grant` y que **la política** decida — que es exactamente para
lo que existe RLS.

**Sin `force row level security`**, y por una razón concreta: estos catálogos
los leen funciones `security definer` (`quality_automation_run`,
`quality_mr_prepare_inputs`, `quality_ai_add_reference`) que corren como
propietario. Forzar RLS sobre el propietario las rompería sin cerrar nada.

## Grants finales

| Tabla | `anon` | `authenticated` |
|---|---|---|
| las siete | **ninguno** | `SELECT` |

## Comprobado ejecutando, no mirando `pg_policies`

`npm run test:sec01-catalogs` · 14 en verde, con identidades reales:

- `anon` no lee ninguna de las siete.
- Una persona normal lee los seis catálogos globales y **no** puede insertar ni
  borrar en ellos.
- Dos empresas distintas leen lo mismo — son globales, y se comprueba para dejar
  dicho que la igualdad es intencionada.
- Una persona normal **ya no lee** `quality_ai_sources`; la de otra empresa
  tampoco.
- **Support** y **Superadmin** sí lo leen, y ninguno de los dos puede escribirlo
  desde la sesión: el vocabulario se cambia con una migración, que deja historia.
- Las tres vistas `security_invoker` siguen leyéndose.
- Ninguna de las siete quedó con `force row level security`.

## El guardia · para no volver a enterarse por un correo

`npm run test:sec01-guard` · 5 en verde. Pregunta al **estado real de la base**,
no al SQL de las migraciones: una migración demuestra la intención de quien la
escribió; el estado demuestra lo que hay puesto.

1. **Cero** tablas base de `public` con RLS desactivado.
2. **Cero** privilegios de `anon`/`authenticated` sobre una tabla sin RLS — la
   forma exacta que tuvo este incidente.
3. Solo las políticas declaradas alcanzan a `anon`. Hoy hay **una**:
   `legal_documents_select_public`, porque los términos vigentes tienen que
   poder leerse antes de aceptarlos.
4. Toda vista que corre como propietario (sin `security_invoker`) y está
   concedida a `anon`/`authenticated` está **clasificada** con el mecanismo que
   la hace segura. Son 14; las de plataforma filtran con `is_platform_staff()`
   dentro de la propia vista.
5. Y eso último se comprueba **preguntando** con una identidad que no es
   personal de plataforma: devuelven cero filas.

El guardia se probó fallando: se creó una tabla nueva en `public` y se puso en
rojo nombrándola. Reveló además algo que conviene saber — en este proyecto una
tabla nueva de `public` recibe por defecto **todos** los privilegios para `anon`
y `authenticated`. Sin RLS, eso no es «lectura de más»: es escritura y borrado
abiertos. Las siete se libraron porque sus migraciones sí revocaron.

Ese mismo invariante viaja además **dentro de la migración 0166** como
preflight: si alguna tabla de `public` llegara sin RLS a cualquier entorno, la
promoción se detiene y dice cuál. Comprobado provocándolo.

## Vistas auditadas

Las tres `security_invoker` que cruzan estos catálogos, más las 14 vistas de
`public` que corren como propietario y están concedidas a `anon`/`authenticated`
(§13). Las dos del dominio Intelligence —`v_intelligence_usage_platform` y
`v_intelligence_usage_platform_by_use_case`, que exponen tokens y coste
estimado— llevan `where is_platform_staff()` **dentro de la definición**, y se
comprobó preguntando con una cuenta sin rol: cero filas. No hay una segunda vía
de exposición equivalente.

## Estado

| Entorno | Cabecera | Tablas de `public` sin RLS |
|---|---|---|
| Local | **0166** | **0** (verificado tras replay limpio 0001→0166) |
| Staging | **0165** | ver nota |
| Producción | **0111** | no tocada |

**Nota sobre la verificación directa en Staging.** 0165 se aplicó a Staging con
`--project-ref qchzkxbnbqeyuxinipln` explícito y `supabase migration list`
confirma local = remoto hasta 0165. La consulta post-fix directa
(`select … from pg_class where not relrowsecurity`) **no se ejecutó**: hacerlo
exige la contraseña de la base de Staging, que no vive en el repositorio, y el
encargo dice explícitamente que no se busquen credenciales. Lo que sí puede
afirmarse: 0165 es DDL determinista sin ramas condicionales, de modo que
aplicarla produce exactamente el estado verificado en local; y el preflight de
0166 volverá a comprobarlo en Staging antes de que PE-04B4 entre.

Para verificarlo a mano:

```sql
select n.nspname, c.relname
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
-- esperado: 0 filas
```

## Producción

No se tocó. Sigue en **0111**. Estas tablas ni siquiera existen allí: se crearon
en 0128–0132, muy por encima de su cabecera. Cuando PE-06 haga el replay de
promoción, **0165 viaja antes que 0166** por numeración, y el preflight de 0166
se niega a continuar si algo llegara sin RLS. La corrección no puede quedarse
atrás.

## Impacto sobre PE-04B4

Ninguno funcional. La migración de PE-04B4 pasó de `0165` a **`0166`** para
dejarle a la corrección de seguridad un número propio y anterior: así se puede
promover sola, sin arrastrar trabajo comercial a medio hacer. No estaba aplicada
en ningún entorno ni commiteada, de modo que renumerarla no rompe append-only.
