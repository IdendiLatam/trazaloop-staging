# PE-02B1 · La historia de una respuesta

Por qué se puede contestar, dentro de un año, «¿qué respondía Trazaloop sobre
seguridad en marzo?».

---

## 1 · Publicar

```
borrador  ──faq_publish_entry──▶  revisión N+1 abierta
                                  revisión N cerrada, con effective_to
                                  revisión N apunta a N+1
                                  entrada → published
```

Tres detalles que no son adorno:

**Se cierra la anterior ANTES de abrir la siguiente.** El índice único parcial
que garantiza «una sola vigente» no se puede diferir: al revés, las dos estarían
abiertas a la vez durante un instante y la inserción fallaría. No es una
preferencia de estilo.

**Publicar lo mismo no crea una revisión.** Si el contenido, la clase normativa
y el estado de verificación coinciden con la vigente, se devuelve la que ya
había. Una historia llena de revisiones idénticas no explica nada.

**Salvo que estuviera cerrada.** Republicar algo retirado con el mismo texto es
una operación legítima y nace una revisión nueva: la historia tiene que poder
decir que estuvo fuera y volvió.

---

## 2 · Retirar

Cierra la revisión vigente y marca la entrada como `unpublished`. **El texto se
queda.** Se puede saber qué decía y hasta cuándo lo dijo.

Una entrada que nunca se publicó sigue en `draft` aunque se pida retirarla:
convertir un borrador en «retirado» diría que estuvo publicado.

---

## 3 · Inmutabilidad, y su única excepción

Una revisión publicada no se toca. Lo único que se le puede hacer es **cerrarla**
—poner su fin de vigencia y quién la sucede— y **solo una vez**.

Sin esa excepción no habría forma de suceder una revisión. Con más margen,
«inmutable» sería un adorno.

Comprobado contra base real:

| Intento | Resultado |
|---|---|
| Reescribir el texto de una revisión publicada | **rechazado** |
| Borrarla | **rechazado** |
| Reescribirla **con la clave de servicio** | **rechazado** |
| Borrarla con la clave de servicio | **rechazado** |
| Reabrir una revisión ya cerrada | **rechazado** |

Las tres últimas son la razón por la que el freno es un **disparador** y no una
política: `service_role` se salta la RLS y no se salta un disparador.

---

## 4 · Restaurar · §18

Restaurar **no reabre** la revisión antigua. Copia su contenido al **borrador**,
y desde ahí se publica como una revisión nueva.

```
revisión 1  «Primera redacción»     [cerrada]
revisión 2  «Segunda redacción»     [cerrada]
revisión 3  «Primera redacción»     [vigente]  ← restaurada
```

La diferencia importa. Reabrir la 1 haría que la historia dijera que ese texto
estuvo vigente en dos periodos distintos **sin decir que hubo otro en medio**.
Copiar deja las tres cosas escritas: lo que decía, lo que dijo después, y que se
volvió a lo primero.

El borrador restaurado se marca solo: `change_note` queda como «Restaurado desde
la revisión N».

---

## 5 · Qué queda registrado en cada revisión

| Campo | Qué responde |
|---|---|
| `revision_number` | en qué orden se dijo |
| `effective_from` / `effective_to` | entre qué fechas se dijo |
| `superseded_by_revision_id` | qué la sucedió |
| `created_by` | quién la publicó |
| `change_note` | por qué |
| `content_hash` | si dos revisiones dicen lo mismo, sin compararlas a ojo |
| `verification_status` + `source_basis` + `verified_at` | en qué se apoyaba, y desde cuándo |

Esa última fila es la que distingue esta historia de un registro de cambios: no
solo dice qué se afirmó, dice **con qué respaldo se afirmó**.

---

## 6 · Lo que la historia todavía no sabe hacer

- **No hay lectura «a fecha»** como la de `trazadoc_guidance_as_of`. Los datos
  están —los periodos de vigencia son completos y sin huecos— pero no hay
  función que los consulte. Se añadirá cuando alguien la necesite; hoy nadie la
  necesita, y una función sin quien la llame es una función sin pruebas reales.
- **No hay comparación entre revisiones.** Es interfaz, y va en B2.
- **No hay historia de las categorías ni de la identidad.** Renombrar una
  categoría o cambiar el orden de una entrada no deja rastro más allá de
  `updated_at`. Es deliberado: la historia que importa es la del **texto que se
  publicó**, y versionar el orden de una lista sería ruido.
