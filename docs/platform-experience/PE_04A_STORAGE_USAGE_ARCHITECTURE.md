# PE-04A · Almacenamiento: cómo se cuenta y quién manda

Aquí vive el defecto que el encargo pidió investigar. **No es cosmético.**

---

## 1 · El defecto Full → «Plan Demo · 0 MB / 50 MB»

### Reproducido

Se creó una empresa en local, se llevaron sus módulos a Full por la misma vía
que usa el superadministrador, y se preguntó a cada fuente:

```
organization_modules       : core=full traceability_6632=full textiles=full quality=full
organization_subscriptions : demo/active          ← nunca se actualizó
effective_plan (RPC)       : full                 ← correcto
v_organization_plan_usage  : plan_code = 'demo'   ← y con él, 50 MB
```

### Causa raíz

`create_organization` inserta `organization_subscriptions.plan_code = 'demo'`.
Subir un módulo a Full escribe `organization_modules.access_mode` y **no toca esa
fila**. La vista de uso lee la fila que nadie actualiza:

```sql
COALESCE(sub.plan_code, 'demo') AS plan_code,
...
LEFT JOIN organization_subscriptions sub ON sub.organization_id = o.id
LEFT JOIN plan_definitions pd ON pd.code = COALESCE(sub.plan_code, 'demo')
```

De ahí sale `pd.storage_limit_bytes` = **52 428 800** = los 50 MB del informe.

### La respuesta a las cuatro hipótesis del encargo

| | Veredicto |
|---|---|
| **A · Solo presentación** | **Sí, para el número mostrado.** La cuota que aplica el servidor es la correcta |
| **B · Metadato comercial obsoleto** | **Sí.** La suscripción quedó congelada en `demo` desde la creación |
| **C · La cuota efectiva sigue siendo 50 MB** | **NO.** `begin_cpr_storage_upload` lee la cuota del **access_mode del módulo** |
| **D · Varias fuentes de verdad compitiendo** | **Sí, y es la causa de las otras tres** |

Es **A + B + D**, y no C. Lo confirma la línea que de verdad decide:

```sql
-- begin_cpr_storage_upload
select storage_limit_bytes into v_quota from plan_definitions where code = v_mode;
--                                                                        ↑
--                                        v_mode = access_mode DEL MÓDULO
```

### Lo que ya se mitigó, y lo que no

RH-01.1 hizo que la consola muestre el **plan efectivo** arriba y rotule el otro
como «Plan heredado (histórico / administrativo)», con un párrafo explicando la
diferencia. Es honesto y **no arregla la causa**: sigue habiendo dos verdades, y
la que se enseña con las megas es la muerta.

Mientras exista una fila que nadie mantiene y una vista que la lee, alguien
volverá a leer «Demo» y a creérselo.

---

## 2 · Dos resolutores de cuota, y no coinciden

| | Ámbito | Plan | Uso |
|---|---|---|---|
| **`begin_cpr_storage_upload`** — *lo que decide* | módulo `traceability_6632` | `access_mode` del módulo | `module_storage_snapshot()`: comprometido + reservado |
| **`v_organization_plan_usage`** — *lo que se enseña* | **toda la empresa** | `organization_subscriptions.plan_code` | Suma de columnas `size_bytes` |

Difieren en **las tres** dimensiones: ámbito, plan y método de conteo. Que en
algún caso den lo mismo es casualidad.

Y hay una **tercera** definición del mismo número: `plan_limits(plan,
'storage_bytes')` duplica `plan_definitions.storage_limit_bytes`. Hoy los
valores coinciden; nada lo garantiza.

> **PEC-07.** Un solo resolutor canónico de cuota, por módulo, y una sola
> definición del número. Toda superficie —subida, consola, tarjeta de uso—
> consulta el mismo.

---

## 3 · Qué cuenta como almacenamiento hoy

### En el resolutor que decide (`module_storage_snapshot`, por módulo)

| Origen | Módulo |
|---|---|
| `evidences.size_bytes` | `traceability_6632` |
| `trazadoc_file_documents` y sus versiones | `traceability_6632` |
| `textile_evidences` | `textiles` |
| `storage_orphan_candidates` | ambos — huérfanos aún no resueltos |
| `textile_evidence_upload_intents` | reservas pendientes |

Cuenta **comprometido + reservado**, y ese es exactamente el diseño correcto:
una reserva viva ocupa cuota, así que dos subidas concurrentes no se cuelan.

### En la vista que se enseña (org-wide)

`evidences` + `organizations.logo_size_bytes` + `trazadoc_file_documents` +
`textile_evidences`. **Sin reservas, sin huérfanos, sin versiones de archivo.**

### Lo que no cuenta en ninguno de los dos

- **Los medios de tutorial.** Verificado en PE-03B5 contra la definición de la
  vista: `platform_tutorial_versions` no aparece. Contenido de plataforma.
- **La FAQ, la ayuda contextual y los documentos legales.** Ninguno tiene
  `organization_id` ni bytes atribuidos a una empresa.
- **Quality.** No tiene hoy adjuntos con `size_bytes` propios; su documentación
  va por TrazaDocs, que sí cuenta y se atribuye a CPR.

> **Hallazgo.** Un documento de TrazaDocs creado desde Quality suma a la cuota
> del módulo **CPR**. Con módulos independientes eso puede sorprender: una
> empresa con Quality en Full y PCR en Demo podría quedarse sin cuota de PCR por
> documentos de Quality. Merece decisión humana; ver §7.

---

## 4 · ¿Se comprueba antes de subir?

**En CPR, sí, y bien.** `begin_cpr_storage_upload` es una reserva previa:

1. valida tipo, tamaño y MIME;
2. resuelve el acceso del módulo;
3. aplica el tope **por archivo** según tipo y plan (`cpr_upload_max_file_bytes`);
4. toma `pg_advisory_xact_lock` por `(empresa, módulo)`;
5. atiende idempotencia y revive una ruta ya reservada;
6. **comprueba la cuota**: `comprometido + reservado + este archivo > cuota` →
   `STORAGE_QUOTA_EXCEEDED`.

Es preflight de verdad: nadie sube 500 MB para descubrir después que tenía 50.

**En Textiles**, `textile_evidence_upload_intents` sigue el mismo patrón de
reserva. **Los medios de tutorial** no aplican cuota de empresa por diseño.

**El logo de empresa** suma en la vista y no pasa por ninguna reserva.

> **PEC-08.** Toda vía de subida de cliente pasa por un resolutor de cuota con
> reserva. Hoy falta el logo, y es poca cosa — pero «poca cosa» es como se
> vuelve a tener dos caminos.

---

## 5 · Duro y blando

| Recurso | Hoy | Recomendado |
|---|---|---|
| Cuota de almacenamiento | **DURO** en la reserva de CPR | Duro. Es coste real |
| Tope por archivo | **DURO** | Duro |
| Conteos (`materials`, `evidences`…) | **DURO**, con bloqueo consultivo | Duro |
| Cuota de almacenamiento en Textiles | duro por reserva | Duro |
| Aviso de acercarse al límite | **no existe** | **BLANDO** — al 80 %, como ya hace la IA |

> **PEC-14.** Un aviso blando antes del muro duro. Hoy se pasa de «todo bien» a
> «rechazado» sin escalón, y eso convierte un límite razonable en una sorpresa.

---

## 6 · Bajar de plan con datos ya guardados

Hoy: **nada se borra** — no hay ningún camino que borre datos por plan, y eso
está bien y hay que conservarlo explícitamente.

Lo que pasaría con Full (500 MB) → Free (por decidir, digamos 50 MB) con 300 MB
guardados:

| | Comportamiento |
|---|---|
| Los datos | **Se conservan. Siempre.** Ni un byte se borra por comercio |
| Leer, descargar, exportar | **Sigue funcionando** |
| Subir algo nuevo | **Rechazado** — la reserva ya lo hace hoy |
| Lo que ve la persona | «Estás por encima del límite de tu plan: 300 MB de 50 MB» |

> **PEC-15.** Estar por encima del límite es un **estado legítimo**, no un error
> de datos. Se muestra, se explica, y bloquea lo nuevo — nunca destruye lo
> viejo. El borrado como mecanismo de cobro está prohibido.

---

## 7 · Decisiones humanas que salen de aquí

1. **¿La cuota es por módulo o por empresa?** Hoy se aplica por módulo y se
   enseña por empresa. Las dos son defendibles; **hay que elegir una**.
2. **¿Los documentos de TrazaDocs creados desde Quality suman a la cuota de
   PCR?** Hoy sí, por herencia del módulo del blueprint.
3. **Los números de Free**: cuántos MB.
4. **¿Se conserva la cuota de Full en 500 MB y la de Extra en 5 GB?** Están en el
   catálogo desde el sprint 10A y nadie las ha revisado comercialmente.
