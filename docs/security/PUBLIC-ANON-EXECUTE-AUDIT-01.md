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

### Las cinco relaciones que se leen sin sesión

`legal_documents` (los textos de `/terms` y `/privacy`), `v_faq_public` y
`v_faq_public_categories` (las preguntas frecuentes de `/faq`). Son públicas
por diseño y solo con SELECT.

**COMMERCIAL-UX-01D0 añadió dos** (migración 0213): `v_public_plan_catalog` y
`v_public_plan_limits`, el catálogo comercial que `/planes` enseña a quien
todavía no es cliente. Pedirle sesión a alguien para ver cuánto cuesta el
producto es lo contrario de lo que hace una página pública.

Las dos son VISTAS, y ahí está la decisión. Se evalúan con los privilegios de
su propietario, así que quien las consulta no necesita permiso sobre las tablas
de debajo: `plans`, `plan_revisions`, `plan_revision_limits` y `plan_resources`
siguen denegadas a `anon`, y se comprueba en la propia migración.

La alternativa —dejarlas como `security_invoker` y abrirle a `anon` las cuatro
tablas con políticas nuevas— se descartó con motivo. Conceder SELECT sobre
`plan_revisions` publica esa tabla en PostgREST, y la RLS filtra FILAS, no
COLUMNAS: cualquiera podría pedir `internal_notes` de una revisión publicada,
que es justo lo que 0162 prometió que no saldría nunca por el catálogo público.
Abrir cuatro tablas para enseñar tres precios amplía la superficie en lugar de
acotarla.

Antes de cambiar nada se midió, con el rol suplantado: `authenticated` y
`postgres` veían exactamente las mismas filas a través de esas vistas (3 planes
y 57 límites). Es decir, la RLS no estaba filtrando nada ahí, y por tanto el
cambio no puede ampliar lo que alguien ya veía. Después se volvió a medir: 3 y
57 también sin sesión, y las cuatro tablas siguen denegadas.

Cerrarlas de más también habría sido un defecto, y estuvo a punto de pasar: al
retirar `is_platform_staff()` del alcance anónimo, `/terms` dejó de cargar.
`legal_documents` tenía **dos** políticas permisivas de lectura y PostgreSQL
las evalúa todas con el rol que consulta, así que una lectura anónima acababa
llamando a una función de personal. La solución no fue devolverle la función a
`anon` sino reapuntar la política de personal a `authenticated`, que es quien
puede serlo.

### Los privilegios por omisión, con la precisión que merece

Hay que separar dos cosas que es muy fácil confundir, y que en la primera
redacción de este documento estaban confundidas:

**Sobre funciones que YA existen**, `REVOKE EXECUTE ON FUNCTION f() FROM PUBLIC`
funciona perfectamente. Es lo que hace 0202 con las 673, y se puede comprobar:
no queda ni una con la entrada `=X/` que representa a `PUBLIC`.

**Sobre funciones FUTURAS**, `ALTER DEFAULT PRIVILEGES … REVOKE EXECUTE ON
FUNCTIONS FROM PUBLIC` es un **no-op en este servidor**. Medido en PostgreSQL
17.6, en un esquema recién creado y sin filas previas:

| Paso | Resultado |
|---|---|
| `ALTER DEFAULT PRIVILEGES … GRANT EXECUTE … TO service_role` | Deja fila y la siguiente función la hereda — el mecanismo funciona |
| `ALTER DEFAULT PRIVILEGES … REVOKE EXECUTE … FROM PUBLIC` | **No deja fila**, y la siguiente función nace con `proacl = NULL` |
| Función creada después | `anon` puede ejecutarla |

`proacl = NULL` no significa «sin permisos»: significa «los de por omisión», y
los de por omisión para una función incluyen `EXECUTE` para `PUBLIC`. Se probó
también con `FOR ROLE`, con `ON ROUTINES` y dentro y fuera de transacción.

Para **tablas y secuencias** sí funciona: una tabla creada después de 0202 ya no
nace concedida a `anon`, y la batería lo comprueba creando una.

### Cómo se cierra entonces lo que nazca mañana

Con un **disparador de evento** sobre `CREATE FUNCTION`
(`trazaloop_deny_public_execute`): cada función que nace en `public` pierde
`PUBLIC` y `anon` en el mismo comando que la crea. No es una lista documental
ni una promesa de revisión: es una revocación que ocurre.

Tres decisiones dentro:

- **Las nueve declaradas se saltan el disparador.** Varias migraciones harán
  `create or replace` sobre ellas —0201 ya lo hizo— y si perdieran la
  concesión, la página pública se caería en cuanto alguien tocara una coma.
  La lista va escrita a mano en el disparador: añadir una décima obliga a
  editarlo, que es justo el punto de revisión que se quiere.
- **Es tolerante.** Si no puede revocar sobre una función concreta —otro rol,
  una extensión— avisa y sigue, en vez de tumbar el DDL. Bloquear la creación
  de funciones de la plataforma por defender una frontera nuestra sería cambiar
  un riesgo por una avería.
- **Se comprueba creando una función de verdad**, tanto en la migración como en
  la batería. Declarar un disparador no demuestra que dispare.

Lo que queda fuera de su alcance: lo que cree `supabase_admin` —no somos
miembros de ese rol y su juego de privilegios por omisión sigue concediendo a
`anon`— y el hueco que deja la tolerancia. Para los dos sigue la batería de
lista cerrada, que es obligatoria y corre en `test:all`.

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
- [x] Y, mejor que detectarlo, se previene: un disparador de evento cierra al
      público toda función nueva de `public`, comprobado creando una.
- [x] La lista blanca coincide con lo que hay en Producción, verificado contra
      Producción y no solo contra local.

La puerta queda **superada**, con evidencia de privilegios efectiva —el
esquema recorrido como `anon`— y no solo con una lista. Los dos huecos que
quedan (`supabase_admin` y la tolerancia del disparador) están arriba, con el
control que los cubre.
