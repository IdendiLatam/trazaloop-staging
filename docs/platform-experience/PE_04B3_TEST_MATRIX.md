# PE-04B3 · Matriz de pruebas

## Lo que se ejecuta contra la base real

`npm run test:pe04b3-storage` · `tests/rls/pe04b3-organization-storage.test.ts`
**22 comprobaciones, todas en verde.**

### A · Un solo cupo para toda la empresa
| | Qué demuestra |
|---|---|
| A1 | 40 MB de PCR dejan a Textiles sin poder reservar 20 MB, y sí 9 de los 10 que quedan |
| A2 | Y al revés: 45 MB de Textiles bloquean 10 MB de PCR |
| A3 | El logo suma exactamente sus bytes al mismo uso |
| A4 | Mirar contenido de `tutorial-media` no altera el uso de la empresa |

### B · Los cuatro estados
| | Qué demuestra |
|---|---|
| B1 | `WITHIN_LIMIT` con 1 byte libre, `AT_LIMIT` justo en el límite (`remaining = 0`), `OVER_LIMIT` con 1 byte de más y `remaining = 0`, no negativo |
| B2 | Sin asignación: `QUOTA_UNAVAILABLE` / `plan_absent`, y no deja reservar ni 1 byte |
| B3 | Revisión que no declara `storage_bytes`: `limit_not_configured` y niega — no es «ilimitado» |
| B4 | Un objeto de tamaño desconocido: `usage_unverifiable` y `STORAGE_UNVERIFIABLE` |

### C · La reserva
| | Qué demuestra |
|---|---|
| C1 | Una carga en curso de 20 MB ocupa aunque su objeto no exista, y `committed` sigue siendo 30 MB: reserva y archivo no se confunden |
| C2 | Sin descontar lo reemplazado niega; descontándolo concede |
| C3 | Una petición negativa se rechaza (`STORAGE_REQUEST_INVALID`) |

### D · Bajar de plan no borra nada
| | Qué demuestra |
|---|---|
| D1 | 200 MB dentro de Full → bajar a Free deja `OVER_LIMIT` con **el mismo número de objetos** |
| D2 | Estando por encima se niega subir, y el intento denegado tampoco toca nada |
| D3 | Subir a Extra devuelve la capacidad al instante, sin migrar nada |

### E · Quién puede preguntar
| | Qué demuestra |
|---|---|
| E1 | Un miembro de otra empresa no lee el estado ajeno |
| E2 | Sin sesión tampoco |
| E3 | La reconciliación la corre el superadministrador y no el cliente |

### F · Reconciliación
| | Qué demuestra |
|---|---|
| F1 | Una fila declarada sin objeto sale como `MISSING_OBJECT` |
| F2 | Un objeto amparado por un intent vigente **no** es deriva |

### G · El camino real, de punta a punta
| | Qué demuestra |
|---|---|
| **G1** | **`begin_textile_evidence_upload_v2` rechaza una carga por bytes que ocupó PCR.** Es el defecto que cierra el sprint: antes miraba el snapshot de su módulo, veía cero y concedía |
| G2 | Y la concede en cuanto cabe — no es que niegue siempre — y su reserva aparece en la misma contabilidad |
| G3 | El logo pasa por la misma reserva: con 49 de 50 MB ocupados no entra, y con el cupo libre sí |

## Lo que se comprueba leyendo

`npm run test:pe04b3-static` · **16 en verde.** Las seis funciones existen, son
`security definer` con `search_path` fijado, ninguna queda expuesta a `anon`, la
migración no borra datos de cliente, la reserva toma el lock **de empresa** y no
el de módulo, los dos caminos de subida llaman a la reserva canónica y ya no
leen `plan_definitions`, pero conservan sus locks de módulo, su límite de
unidades y su barrera de acceso. El uso canónico incluye lo que la vista legacy
ignoraba y excluye `tutorial-media`. El puente `free→demo` salió del camino de
almacenamiento en los tres sitios (acción de cuota, preflight por módulo y
consola de plataforma). Un fallo de lectura devuelve `null` y no un estado
permisivo. El logo retira los restos de extensiones anteriores.

`npm run test:pe04b3-bypass` · **6 en verde.** Ninguna escritura a Storage fuera
de los cinco caminos declarados; cada camino sigue existiendo, sigue escribiendo
y no cambió de bucket; ningún camino de cliente toca un bucket de plataforma ni
al revés; `uploadFileDocumentFile` sigue retirada.

**El guardia se probó contra un bypass real**: un archivo nuevo con
`.upload("evidences")` sin declarar lo puso en rojo señalando archivo y línea.

## Reejecución limpia y regresión

- `bash scripts/replay-local.sh` — **156 migraciones, 0 fallos, cabecera 0164**.
- `npm run test:all` — **en verde**. `0 errores` de lint y **68 avisos
  heredados** (el mismo número que antes del sprint).
- `npm run build` — correcto.
- `npm run test:pe04b1-resolver` (30 ✔) y `npm run test:pe04b2-baseline` (29 ✔)
  siguen en verde contra la base reejecutada.

## Pruebas heredadas que hubo que actualizar

No se relajó ninguna: en todas se sustituyó la afirmación sobre la
**implementación vieja** por la afirmación sobre el **mismo invariante** en la
nueva.

| Prueba | Qué afirmaba | Qué afirma ahora |
|---|---|---|
| `t9f1` 20-23/40 | el uso sale de `fetchOrganizationModuleUsage` | los conteos siguen decidiéndose en BD por módulo; la **capacidad** sale del estado canónico de empresa |
| `t9f2` 26 | `storageObjectConflicts > 0` bloquea | `conflictCount > 0` bloquea, vía `QUOTA_UNAVAILABLE`, conservando la razón |
| `t9f3` 24-26 | `storageUnknownSizeCount > 0` bloquea | `unknownSizeCount > 0` bloquea igual, con la contabilidad de empresa |
| `rh01` 6 | la cuota sale de `plan_definitions` por plan efectivo | sale del estado canónico; se prohíbe explícitamente volver al puente |
| `rh01` 7 | el logo pasa por `checkStorageAvailable` | pasa por la reserva canónica con los bytes que de verdad se escriben |
| `rh01` 10 | la consola deriva la cuota de `plan_definitions` | la consola enseña la **misma** cuota que el servidor exige |
| `pe04b2` B3 | tres sitios deniegan ante `tier === null` | dos lo hacen; el tercero (almacenamiento) deniega por `QUOTA_UNAVAILABLE` |
| `plans` corr. 8 | el logo hereda el bloqueo administrativo de `checkStorageAvailable` | el logo pide `checkOrganizationCanMutate()` **explícitamente** |

Esa última no fue una actualización cosmética: al mover la cuota del logo a la
reserva canónica, el eje administrativo (suspended/cancelled) dejó de viajar de
rebote y una cuenta suspendida habría podido cambiar su logo. La prueba heredada
lo detectó y se corrigió el código, no la prueba.

## Autorización de la migración

`0164_canonical_organization_storage_quota.sql` se añadió a las listas blancas
de migraciones de las **16** suites que las mantienen.
