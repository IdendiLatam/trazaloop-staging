# PE-02B2 · Los documentos legales, endurecidos

**Migración:** `0156_platform_legal_documents_hardening.sql`

---

## 1 · El hueco, tal como lo encontró PE-02B1

`legal_documents` tenía casi todo lo necesario: unicidad por `(tipo, versión)`,
un índice único parcial que garantiza **un activo por tipo**, y una aceptación
que referencia el **`id`** del documento — de modo que publicar una versión
nueva vuelve a pedir la aceptación por sí solo.

Lo que faltaba era lo que sostiene todo lo demás. La política
`legal_documents_update` permitía a un superadministrador **reescribir el
contenido de la versión activa en su sitio**: cambiar lo que dice la política de
privacidad que la gente ya aceptó, sin cambiar su identificador, sin dejar
rastro y sin que nadie tuviera que volver a aceptarla.

Eso convierte una prueba de consentimiento en un texto editable.

---

## 2 · La auditoría previa · §18

Antes de tocar nada:

| Pieza | Cómo estaba |
|---|---|
| Tabla | `id`, `document_type`, `version`, `title`, `content`, `status`, `published_at`, `created_at`, `updated_at` |
| Estados admitidos | `draft`, `active`, `archived` — **el modelo ya anticipaba la sucesión** |
| Unicidad | `(document_type, version)` |
| Uno vigente por tipo | índice único parcial `where status = 'active'` |
| Lectura pública | `using (status = 'active')` para `{anon, authenticated}` |
| Escritura | `insert` y `update` con `is_platform_superadmin()` |
| Aceptación | `user_legal_acceptances` → `legal_document_id`, más copia de tipo y versión |
| Resolución de lo vigente | `accept_active_legal_documents` (0068) decide ella sola cuáles son los requeridos: `terms` y `privacy` |
| La puerta | `requireLegalAcceptance` → `/legal/accept`; compara documentos activos con lo aceptado **por id** |

**Cómo provoca la re-aceptación un sucesor**, verificado y no supuesto: la
comparación es por `id`. Una versión nueva es una fila nueva, con id nuevo, así
que la persona no figura como que la aceptó y la puerta se lo pide. No hay nada
que programar — es consecuencia de suceder en vez de reescribir. **Reescribir en
su sitio era exactamente lo que lo rompía.**

---

## 3 · Lo que 0156 hace

### 3.1 · Un disparador de inmutabilidad

Una versión que ha estado activa no se toca. Se protegen `document_type`,
`version`, `title`, `content`, `content_hash` y `published_at`.

Dos únicas excepciones: **archivarla** —con su fecha de retiro— y **decir quién
la sucede**, una sola vez.

Un borrador sí se corrige: para eso es un borrador. Deja de poder tocarse en el
instante en que se publica.

Y se prohíbe borrar cualquier cosa que no sea un borrador, o que alguien haya
aceptado: borrar una versión aceptada dejaría aceptaciones apuntando al vacío.

**Es un disparador y no una política**, y esa elección es el punto: una política
no frena a `service_role`, y esto tiene que frenarlo. Comprobado.

### 3.2 · Cuatro funciones

```
legal_create_draft(tipo, versión, título, texto, nota)  → uuid
legal_update_draft(id, título, texto, nota)             → void
legal_publish_document(id)                              → uuid
legal_discard_draft(id)                                 → void
```

Las cuatro `security definer`, con `search_path` fijo, exigiendo
`is_platform_superadmin()`, revocadas para el anónimo.

### 3.3 · La procedencia que faltaba

`created_by`, `published_by`, `change_note`, `content_hash`, `supersedes_id`,
`superseded_by_id`, `retired_at`. Todas aditivas y nulas; a las dos versiones
existentes solo se les rellenó la huella, que es un cálculo sobre lo que ya
dicen.

### 3.4 · Que la plataforma pueda ver lo que no está activo

Hasta hoy la única política de lectura era `status = 'active'`, **para todo el
mundo**: un borrador legal era invisible incluso para quien acababa de
escribirlo. Se añade `legal_documents_staff_select`.

**La lectura pública no cambia.** Sigue siendo la de 0066, palabra por palabra.

---

## 4 · La sucesión

```
borrador  ──legal_publish_document──▶  vigente
                                        anterior → archivada, con retired_at
                                        anterior.superseded_by_id → nueva
                                        nueva.supersedes_id → anterior
```

Se **archiva antes de activar**, y no es una preferencia de estilo: el índice
único parcial de «uno activo por tipo» no se puede diferir, así que activar
primero dejaría dos activas durante un instante y la operación fallaría.

**Una versión archivada no vuelve a estar vigente.** Para volver a ese texto se
publica como versión nueva. Sin esa regla, la historia podría decir que un texto
estuvo vigente en dos periodos sin decir que hubo otro en medio.

---

## 5 · Lo que NO cambia, y conviene decirlo

- `legal_documents_select_public` — igual.
- `accept_active_legal_documents` (0068) — no se toca.
- `user_legal_acceptances` — no se toca. Una aceptación es consentimiento real:
  ni se migra, ni se reinterpreta, ni se hereda.
- `terms` v1 y `privacy` v1 siguen vigentes, **con su mismo id**. Nadie tiene
  que volver a aceptar nada por esta migración.

Esto último no es casualidad: es la razón por la que la migración es aditiva y
por la que las suites montan su escenario sobre `data_processing`, que no es un
documento requerido para entrar (§20 del encargo: no bloquear a las cuentas de
QA sin manejar el fixture).

---

## 6 · Por qué no se convirtió en las tablas de la FAQ

Porque el modelo nativo ya es correcto —una fila por versión, sucesión por
filas— y cambiarlo obligaría a migrar las aceptaciones. Lo que faltaba no era el
modelo: era el freno.

Las diferencias con la FAQ son deliberadas:

| | FAQ | Legales |
|---|---|---|
| Identidad y texto | separados | **la misma fila**: una versión legal *es* su texto |
| Borrador | tabla aparte | **estado** de la propia fila |
| Retirar | vuelve a poder publicarse | archivada para siempre |
| Consecuencia de publicar | se lee otra cosa | **a todo el mundo se le vuelve a pedir aceptar** |

---

## 7 · Lo que se comprobó · §26

| | Intento | Resultado |
|---|---|---|
| R | Reescribir el contenido de la versión vigente | **rechazado** |
| R2 | Cambiar su título, su versión o su fecha de publicación | rechazado |
| R3 | Reescribirla **con la clave de servicio** | rechazado |
| S | Reescribir una versión archivada | rechazado |
| S2 | Revivir una archivada | rechazado |
| AA | Borrar una versión publicada | rechazado |
| AA2 | Descartar un borrador nunca publicado | permitido |
| AA3 | Descartar una versión vigente | rechazado, con palabras |
| V | La aceptación queda atada a la versión aceptada | sí |
| W | La versión nueva **no** hereda la aceptación | sí |

---

## 8 · La numeración, corregida

PE-02A previó `0156` para la ayuda contextual. Era un pronóstico, no una
invariante, y el encargo de B2 lo dice expresamente. La numeración vigente:

```
0155  cimientos de la FAQ            (PE-02B1)
0156  endurecimiento legal           (PE-02B2)
0157  ayuda contextual, si hace falta (PE-02B4)
```

Los documentos de PE-02A y PE-02B1 que hablaban de «0156 · ayuda contextual»
quedan actualizados con esta corrección.
