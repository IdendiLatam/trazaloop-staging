# PE-03B1 · Versiones, publicación e historia

---

## 1 · Subir no publica

Es el punto que separa este diseño de «reemplazar el vídeo», y lo que permite
previsualizar antes de que nadie lo vea.

```
reservar → subir → verificar → candidata → publicar → vigente → histórica
```

Una candidata **existe y no se ve**: la vista del producto solo devuelve
versiones con vigencia abierta. No es una comprobación que alguien pueda
olvidar; es que la consulta no las mira.

---

## 2 · Una sola vigente, garantizada por un índice

```sql
create unique index tutorial_versions_vigente
  on platform_tutorial_versions (tutorial_id)
  where effective_from is not null and effective_to is null;
```

**Lo garantiza el índice, no la función.** Una función se puede llamar dos veces
a la vez; un índice único no se puede violar dos veces. Publicar cierra la
vigente antes de abrir la nueva, porque un índice único parcial no se puede
diferir.

---

## 3 · Reponer, sin falsear la cronología

El encargo pide poder volver a usar una versión antigua y prohíbe la vía fácil:
**no se reabre el periodo histórico**.

```
histórica A ──elegir como base──▶ candidata nueva ──publicar──▶ vigente
```

La versión nueva apunta **al mismo objeto** —seguro, porque nadie sobrescribe
nunca— y guarda `restored_from_version_id`. La historia queda así, y es la
verdad:

| Versión | Periodo | Contenido |
|---|---|---|
| v1 | mar–jun | archivo X |
| v2 | jun–ago | archivo Y |
| **v3** | ago–hoy | **archivo X**, repuesto de la v1 |

Lo que **no** se hace es reabrir el periodo de la v1, que diría que ese vídeo
estuvo vigente desde marzo hasta hoy con un hueco imposible en medio.

**Reponer no publica.** Devuelve una candidata; publicarla es un paso aparte y
deliberado.

### Cómo se comprueba, y cómo NO

PE-03A avisó de que esta comprobación sale verde sin demostrar nada si se hace
mal. Ver que existe una versión nueva no prueba nada.

Lo que se comprueba es que **el `effective_to` de la versión antigua no se
movió**, leído antes y después de reponer. Y que el disparador rechaza reabrirlo
incluso con el cliente administrativo.

---

## 4 · Lo que se conserva no son las filas: son los bytes

La otra trampa que PE-03A escribió antes de caer en ella.

«La versión anterior se conserva» comprobado contando filas no demuestra nada:
las filas se conservan casi siempre. **Lo que se puede perder son los bytes.**

Así que la comprobación descarga el objeto de la versión anterior después de
publicar la nueva y **compara su resumen SHA-256** con el que se calculó
entonces. Si alguien sobrescribiera la ruta, la fila no se enteraría.

---

## 5 · Retirar

Deja de verse. No borra nada: la versión queda con su periodo cerrado, y la
pantalla vuelve a decir que el tutorial está en actualización.

---

## 6 · Nada se borra

- **No hay borrado de versiones publicadas o históricas.** No está escondido: el
  disparador lo rechaza, y se comprobó con el cliente administrativo.
- Sí se puede borrar una **candidata** que nunca se publicó: no es historia de
  nada, y hay que poder limpiarla.
- La historia vive en las tablas de negocio, no en el registro de auditoría:
  quién subió, quién publicó y cuándo se vio cada versión son datos del
  contenido, no rastros técnicos.

---

## 7 · Un efecto de esto que conviene saber

Como una versión publicada no se puede borrar, **un tutorial que llegó a
publicar algo no se puede eliminar del todo**: se retira, y retirado no se ve en
ninguna parte.

Es correcto y es la consecuencia de la promesa. Se nota en las pruebas: cada
suite usa una clave de pantalla propia con marca de tiempo, de modo que cada
pasada es independiente y ninguna estorba a la siguiente.
