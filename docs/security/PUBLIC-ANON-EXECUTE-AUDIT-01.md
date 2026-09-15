# PUBLIC-ANON-EXECUTE-AUDIT-01

**Estado:** CERRADA
**Naturaleza:** puerta obligatoria (*gate*) antes de abrir la primera campaña
pública real.
**Registrada en:** PUBLIC-DIAGNOSTICS-01F (§23). **Cerrada en
PUBLIC-DIAGNOSTICS-01H**, migración `0202_public_anon_execute_audit.sql`.
**Batería que la sostiene:** `npm run test:pd01h-db`.

---

## Qué es

Supabase concede `EXECUTE` a `anon` sobre **todo** lo que se crea en el esquema
`public`. No hace falta escribir un `grant`: la concesión por omisión ya está
puesta cuando la función nace. Así que cada migración de este proyecto —desde
la primera— ha ido dejando funciones alcanzables por un cliente sin sesión.

Medido el 15 de septiembre de 2026 sobre el esquema reconstruido desde las
migraciones:

| Clase | Cuántas | Riesgo |
|---|---|---|
| Devuelven `trigger` | 64 | Prácticamente inertes: fuera de un disparador no tienen `new`/`old` y fallan |
| `SECURITY DEFINER`, no disparador | 24 | **Aquí está el riesgo**: se ejecutan con los permisos del dueño y no ven la RLS de quien llama |
| `SECURITY INVOKER`, no disparador | 19 | Se ejecutan como `anon`, así que la RLS sigue protegiendo lo que toquen |
| **Total con `anon=X`** | **107** | |

*(La cifra volvió a medirse en 01H sobre el esquema completo: **681 funciones,
94 alcanzables por `anon`**, y **420 relaciones, 125 con SELECT concedido**. La
diferencia con las 107 de agosto es el crecimiento del propio subsistema
público más el cierre de SECURITY-HOTFIX-01.)

De las 24 `SECURITY DEFINER`:

- **5 son deliberadas y de este subsistema** (`public_diagnostic_*`, 0198/0199).
  Nacen declaradas una a una y su superficie está probada.
- **3 más son públicas por diseño y con testigo**: `quality_resolve_survey_token`,
  `quality_submit_survey_response` y `resolve_textile_passport_share`.
- **2 son predicados** (`is_platform_staff`, `is_platform_superadmin`): resuelven
  sobre `auth.uid()`, que para `anon` es nulo.
- **14 son la familia `quality_mr_src_*`** (fuentes de la revisión por la
  dirección, QUALITY-10). Estas son la prioridad.

---

## Hallazgo confirmado · `quality_mr_src_*` · **CERRADO en SECURITY-HOTFIX-01**

**No es deuda teórica.** Comprobado en Staging el 15 de septiembre de 2026,
como rol `anon`, sin sesión y sin testigo:

> `quality_mr_src_audits(<uuid de una organización>, <desde>, <hasta>)`
> devolvió **7 auditorías reales** de esa organización, con `code`, `title`,
> `type`, `nature`, `status`, fechas de ejecución y conteos de hallazgos,
> acciones y casos abiertos.

La función *sí* comprueba la membresía —`is_org_member(p_organization_id)`—
pero solo dentro de la primera de sus cuatro subconsultas. El resto de la
respuesta se compone sin pasar por esa puerta, y como la función es
`SECURITY DEFINER` la RLS de las tablas no la frena.

Las catorce hermanas mencionan `is_org_member`, pero **mencionar no es lo mismo
que estar cerradas**: exactamente eso es lo que hay que revisar función a
función.

Lo único que hace falta para leer datos de otra empresa es conocer —o
adivinar— un `uuid` de organización. No hay que autenticarse.

**Esto es anterior a las campañas públicas** y no lo introduce ninguna
migración de PUBLIC-DIAGNOSTICS. Pero abrir una campaña real multiplica el
número de personas que llegan a la aplicación sin sesión, y por eso la puerta
se registra aquí.

### Cómo se cerró

`0200_quality_mr_src_privilege_boundary.sql` (SECURITY-HOTFIX-01), con las dos
capas:

- **Frontera de privilegio.** Los quince adaptadores —y los quince cuerpos
  `_impl`— quedan revocados de `PUBLIC`, `anon`, `authenticated` y
  `service_role`. Solo los ejecuta su dueño, que es exactamente quien los
  llama: el despachador `SECURITY DEFINER`.
- **Autorización interna.** Cada adaptador pasa a ser una puerta que comprueba
  `is_org_member(p_organization_id)` —las mismas palabras que el despachador— y
  delega en su cuerpo, renombrado a `_impl`. Ninguna línea de QUALITY-10 se
  reescribió: la propiedad es cierta por construcción para los quince, y una
  sola prueba la comprueba en todos.

La causa fue local a 0128: cerró el despachador y las once funciones de
orquestación, y no revocó sus catorce adaptadores. 0150, al añadir el
decimoquinto, sí lo hizo — el patrón estaba bien, faltaba aplicarlo.

Batería: `npm run test:sec-hotfix-01`.

---

## Cómo quedó · PUBLIC-DIAGNOSTICS-01H

### Lo que se midió, no lo que se dedujo

Se recorrieron las **420 relaciones** del esquema ejecutando un `select` real
como rol `anon`. Antes de 0202 respondían con filas tres; después, las mismas
tres. Lo que cambió es todo lo demás: de 125 relaciones con SELECT concedido y
120 con INSERT se pasó a **tres con SELECT y ninguna con escritura**. La RLS
seguía sosteniendo el resto, pero eso era una sola capa.

### Las nueve funciones que quedan

| Función | Para qué | Por qué la necesita `anon` | Escribe | Frontera y control de abuso |
|---|---|---|---|---|
| `public_diagnostic_resolve_campaign(text)` | Pintar la puerta de una campaña | La página es pública y sin sesión | No | No devuelve ni el id de la campaña; inexistente, borrador y archivada responden igual |
| `public_diagnostic_begin_submission(…)` | Crear la participación | Es el alta del recorrido público | **Sí** | Señuelo, testigo de formulario firmado con edad mínima, y ventana deslizante: 3/correo/24 h, 30/IP/hora, 500/campaña/hora |
| `public_diagnostic_get_assessment(text)` | Entregar el instrumento y lo respondido | El cuestionario se responde sin cuenta | No | Atada al testigo; sin peso, criticidad ni umbrales; 600 lecturas/hora |
| `public_diagnostic_save_progress(text,text,jsonb)` | Guardar una sección | Igual | **Sí** | Atada al testigo, tope de lote por sección, 120 guardados/hora |
| `public_diagnostic_get_result(text)` | Devolver la instantánea congelada | El informe se ve sin cuenta | No | Atada al testigo; no recalcula nada |
| `public_diagnostic_resume_submission(text)` | Saber a qué campaña pertenece un testigo | Continuidad en el mismo navegador | No | Sin datos personales en la respuesta |
| `quality_resolve_survey_token(text)` | Abrir una encuesta de QUALITY-12 | `/survey/[token]` es público | No | Testigo de un solo uso |
| `quality_submit_survey_response(text,jsonb)` | Responderla | Igual | **Sí** | Consumir el testigo ES la comprobación |
| `resolve_textile_passport_share(text)` | Pasaporte textil compartido | `/textile-passport-share/[token]` | No | Atada al testigo |

Las tres últimas son anteriores a los diagnósticos públicos y se conservan
porque tienen consumidor real: se comprobó en el repositorio, función por
función, no se supuso.

### Las tres relaciones que se leen sin sesión

`legal_documents` (los textos de `/terms` y `/privacy`), `v_faq_public` y
`v_faq_public_categories` (las preguntas frecuentes de `/faq`). Son públicas
por diseño y solo con SELECT.

Cerrarlas de más también habría sido un defecto, y estuvo a punto de pasar: al
retirar `is_platform_staff()` del alcance anónimo, `/terms` dejó de cargar.
`legal_documents` tenía **dos** políticas permisivas de lectura y PostgreSQL
las evalúa todas con el rol que consulta, así que una lectura anónima acababa
llamando a una función de personal. La solución no fue devolverle la función a
`anon` sino reapuntar la política de personal a `authenticated`, que es quien
puede serlo.

### Lo que no se pudo prevenir, y cómo se cubre

0202 cambió los privilegios por omisión del rol `postgres`: **una tabla o una
secuencia nueva ya no nace concedida a `anon`**, y está comprobado creando una
de verdad en la batería.

Para **funciones no se logró**. Además de la concesión de Supabase —que sí se
retira— PostgreSQL concede por su cuenta `EXECUTE` a `PUBLIC` sobre toda
función nueva, y `anon` lo hereda por ahí. Se intentaron las tres formas
documentadas (`REVOKE … ON FUNCTIONS FROM public`, `ON ROUTINES`, y
grant-seguido-de-revoke) y ninguna surte efecto en esta instancia.

Tampoco se pudieron tocar los privilegios por omisión de `supabase_admin`: hace
falta ser miembro de ese rol.

Así que para funciones el control **no es prevención sino detección**, y es un
control real: `npm run test:pd01h-db` lleva la lista cerrada de las nueve y se
pone roja en cuanto aparece una décima sin declarar. Cada migración que cree
una función tiene que revocarla explícitamente —como hacen 0198, 0199, 0201 y
0203— y si alguien lo olvida, se ve antes de que llegue a ninguna parte.

**Residuo aceptado, dicho por delante:** entre que alguien crea una función y
que corre la batería, esa función es alcanzable por `anon`. La ventana es el
tiempo de una revisión, no el de un despliegue, porque `test:all` es previo.

---

## Alcance de la auditoría, cuando se aborde

1. **Inventariar.** Listar toda función de `public` con `anon=X` en su ACL,
   con su clase (`trigger` / `definer` / `invoker`), su firma y la migración
   que la creó.
2. **Clasificar.** Tres cajones y ninguno más:
   - *pública legítima* — se conserva y se DECLARA en una lista cerrada;
   - *inerte* — hay que **demostrar** por qué (un disparador que sin `new`
     falla; un predicado que sobre `auth.uid()` nulo no resuelve nada);
   - *innecesaria* — se revoca.
3. **Demostrar lo inerte.** Con una llamada real como `anon`, no leyendo el
   código. La familia `quality_mr_src_*` es justamente el ejemplo de lo que
   pasa cuando se supone en vez de comprobar: sus quince mencionaban
   `is_org_member` y catorce eran legibles sin sesión.
4. **Revocar** las innecesarias, en una migración, con la lista escrita.
5. **Guardar la puerta.** Una prueba con una lista blanca CERRADA: cualquier
   función nueva que nazca alcanzable por `anon` sin estar declarada, la pone
   en rojo. Sin eso, el inventario se desactualiza con la migración siguiente.

La familia `quality_mr_src_*` ya está fuera de este alcance: se cerró en
SECURITY-HOTFIX-01 y tiene su propia batería. Sirve de plantilla para las
demás — revocar **y** poner la puerta dentro, no una de las dos.

---

## Criterio de salida · CUMPLIDO

- [x] Existe el inventario completo, con su clasificación y su evidencia
      (arriba, y medido recorriendo el esquema como `anon`).
- [x] `quality_mr_src_*` ya no es alcanzable por `anon` — cerrado en
      SECURITY-HOTFIX-01, migración 0200, comprobado con una llamada real.
- [x] Hay una prueba con lista blanca cerrada que falla si nace una función
      pública sin declarar — `tests/rls/pd01h-admin-export.test.ts`.
- [x] La lista blanca coincide con lo que hay en Producción, verificado contra
      Producción y no solo contra local.

La puerta queda **superada**. Lo que no se pudo prevenir está arriba, con su
control de detección y su residuo escrito.
