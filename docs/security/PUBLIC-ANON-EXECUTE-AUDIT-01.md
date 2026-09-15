# PUBLIC-ANON-EXECUTE-AUDIT-01

**Estado:** ABIERTA
**Naturaleza:** puerta obligatoria (*gate*) antes de abrir la primera campaña
pública real.
**Registrada en:** PUBLIC-DIAGNOSTICS-01F (§23 del encargo).
**No se cierra en 01F**, y el encargo lo dice expresamente: cerrar esto es
analizar más de cien funciones una a una, y hacerlo dentro de un tramo de
producto sería trabajo apresurado sobre superficie de seguridad.

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

## Hallazgo confirmado · `quality_mr_src_*`

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
   pasa cuando se supone en vez de comprobar.
4. **Revocar** las innecesarias, en una migración, con la lista escrita.
5. **Guardar la puerta.** Una prueba con una lista blanca CERRADA: cualquier
   función nueva que nazca alcanzable por `anon` sin estar declarada, la pone
   en rojo. Sin eso, el inventario se desactualiza con la migración siguiente.

Para la familia `quality_mr_src_*` la revocación probablemente basta: son
fuentes de una pantalla autenticada, y el servidor las llama con una sesión.
Hay que confirmarlo antes.

---

## Criterio de salida

La puerta se considera superada cuando:

- [ ] Existe el inventario completo, con su clasificación y su evidencia.
- [ ] `quality_mr_src_*` ya no es alcanzable por `anon`, o se demuestra con una
      llamada que no devuelve nada de una organización ajena.
- [ ] Hay una prueba con lista blanca cerrada que falla si nace una función
      pública sin declarar.
- [ ] La lista blanca coincide con lo que hay en Producción, verificado contra
      Producción y no solo contra local.

Hasta entonces **no se abre la primera campaña pública real**.
