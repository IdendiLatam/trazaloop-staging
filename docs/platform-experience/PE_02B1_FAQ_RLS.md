# PE-02B1 · Quién puede leer la FAQ

El modelo de acceso de `0155`. Complementa
[PE_02B1_FAQ_DATA_FOUNDATION.md](./PE_02B1_FAQ_DATA_FOUNDATION.md).

---

## 1 · La regla, en una frase

**Las tablas no son legibles para nadie que no sea de la plataforma.** Lo que se
lee sin ser de la plataforma son **vistas**, y el filtro va dentro de ellas.

Es la lección de 0136 §4, escrita allí después de descubrir el fallo:

> proteger el contenido en la capa de aplicación deja la tabla abierta a quien
> sepa pedirla — por identificador, desde el navegador.

---

## 2 · La matriz completa

| | anónimo | miembro | `support` | `superadmin` |
|---|---|---|---|---|
| `v_faq_public` | **sí** | sí | sí | sí |
| `v_faq_authenticated` | **no** (sin permiso) | **sí** | sí | sí |
| `v_faq_public_categories` | sí | sí | sí | sí |
| `faq_categories` | **sin permiso** | 0 filas | **sí** | sí + escribe |
| `faq_entries` | **sin permiso** | 0 filas | **sí** | sí + escribe |
| `faq_entry_revisions` | **sin permiso** | 0 filas | **sí** | lee; **no escribe** |
| `faq_entry_drafts` | **sin permiso** | 0 filas | **sí** | sí + escribe |
| `faq_publish_entry` | — | error | error | **sí** |
| `faq_unpublish_entry` | — | error | error | **sí** |
| `faq_restore_revision_to_draft` | — | error | error | **sí** |

«Sin permiso» y «0 filas» son cosas distintas y las dos están comprobadas: al
rol anónimo no se le concede la tabla en absoluto; a un miembro con sesión se le
concede el permiso de tabla —hace falta para que las políticas de plataforma
puedan aplicarse— y la política le devuelve cero.

---

## 3 · Las dos cerraduras, y por qué hacen falta las dos

En Postgres, **el permiso y la política son cosas distintas**:

- sin `grant`, ni el superadministrador puede insertar;
- sin política, podría cualquiera con el `grant`.

Por eso `0155` concede `insert, update, delete` al rol `authenticated` sobre
categorías, entradas y borradores, y **la política decide** quién de ese rol
escribe de verdad (`is_platform_superadmin()`).

`faq_entry_revisions` **no recibe permiso de escritura**, y no es un olvido: las
revisiones solo nacen por `faq_publish_entry`, que las numera, cierra la
anterior y rechaza lo que no se puede afirmar. Escribirlas a mano se saltaría
las tres cosas. Comprobado: un superadministrador que lo intenta recibe un
error.

---

## 4 · Las vistas, y por qué no llevan `security_invoker`

Con `security_invoker` se evaluaría la RLS de quien pregunta, que a un anónimo
o a un miembro le devuelve cero. Sin él, la vista la evalúa su propietario y
**el filtro de la vista es la única frontera** — que es justo lo que se quiere
aquí. Mismo patrón que `v_platform_organizations` (0055) y las vistas de 0141,
y por la misma razón.

```sql
where e.status    = 'published'
  and e.visibility = 'public'      -- 'public' + 'authenticated' en la otra
  and c.status    = 'active'
  and r.effective_to is null       -- la vigente, y solo la vigente
```

Esa última línea es la que impide que la historia entera sea pública.

`v_faq_authenticated` añade `auth.uid() is not null`. El rol anónimo ya no tiene
permiso sobre esa vista, así que la línea es una **segunda cerradura**: se pone
porque una concesión mal hecha en el futuro no debería bastar para abrir la
puerta.

---

## 5 · Lo que las vistas NO proyectan

Ninguna de las tres devuelve:

```
source_basis · verification_note · verification_status · verified_at
change_note  · created_by · updated_by · content_hash
effective_to · superseded_by_revision_id · revision_number
```

La procedencia interna de una afirmación es **gobierno editorial**, no contenido
público. Comprobado por dos caminos: leyendo las columnas de la vista en el
catálogo del sistema, y pidiendo la fila entera con `select *` desde una sesión
anónima y desde una con sesión.

---

## 6 · Lo que un borrador no puede hacer

Tres intentos, los tres comprobados contra base real:

1. pedirlo por su `slug` en la vista pública → nada;
2. buscarlo por el texto que contiene → nada;
3. pedir la tabla de borradores directamente → sin permiso.

El texto de prueba lleva un marcador único (`SECRETO_DE_BORRADOR_<sello>`)
precisamente para que la tercera comprobación no pueda pasar por casualidad.

---

## 7 · Sin `service_role`

§15 y §32 del encargo, cumplidos por construcción: no hay cliente
administrativo en ningún camino de la FAQ, y una vista con su filtro dentro no
lo necesita. La migración no menciona `service_role`, y no existe capa de datos
de FAQ en `lib/db/`.

Una comprobación adicional, esta contra la base: **la clave de servicio tampoco
puede reescribir la historia**. El freno de inmutabilidad es un **disparador**,
no una política, y un disparador no se salta con `bypassrls`.

---

## 8 · Las funciones, acotadas como manda §25

Las cuatro funciones de FAQ —tres de negocio y el disparador— cumplen:

| Requisito | Cómo |
|---|---|
| `search_path` fijo | `set search_path = public` en las cuatro |
| Concesiones explícitas | `revoke all … from public, anon` + `grant execute … to authenticated` |
| Tipo de retorno estrecho | `uuid` y `void`; ninguna devuelve `record` ni `setof record` |
| Sin identificadores arbitrarios | ningún SQL dinámico; ningún parámetro entra en un nombre de objeto |
| Sin camino de escritura para el público | el anónimo no puede ejecutar ninguna |
| No se puede pedir un borrador por parámetro | las funciones no leen; las vistas no aceptan identificadores |

El disparador de inmutabilidad también tiene revocado su permiso de ejecución:
una función de disparador no se llama a mano, y el permiso por defecto de
Postgres dejaba que cualquiera lo intentara.

---

## 9 · Las invariantes de aislamiento, convertidas en pruebas

La auditoría de PE-02A **midió** el esquema. Esas medidas son ahora pruebas, y
—como pide §24— comprueban **invariantes, no fotografías**: no se cuenta cuántas
tablas hay, se comprueba que ninguna con datos de empresa se quedó sin control
de acceso.

| | Invariante | Estado |
|---|---|---|
| R1 | Ninguna tabla con `organization_id` sin RLS | verde |
| R2 | Ninguna política de lectura `true` sobre datos de empresa | verde |
| R3 | Toda clave compuesta con empresa la lleva en los dos lados | verde |
| R4 | El rol anónimo solo alcanza `legal_documents` por política | verde |

**R4 merece una nota.** La FAQ pública **no** aparece en esa lista y es correcto:
el anónimo llega a ella por una **vista con permiso de lectura**, no por una
política que le abra una tabla. La invariante sigue diciendo exactamente lo que
decía antes de este tramo, y por eso sigue sirviendo para detectar que alguien
abrió una tabla al público sin querer.
