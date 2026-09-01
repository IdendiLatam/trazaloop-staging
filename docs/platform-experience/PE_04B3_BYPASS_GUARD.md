# PE-04B3 · Guardia de puertas laterales

## Por qué

La cuota solo vale lo que valga el camino más flojo para escribir bytes. Da
igual lo buena que sea la reserva si alguien añade en seis meses un
`supabase.storage.from("evidences").upload(...)` en una acción nueva.

El caso que lo motiva no es hipotético: `uploadFileDocumentFile` subía a
`trazadocs-documents` **sin intent y sin reserva**, no la llamaba nadie en todo
el repositorio, y llevaba sprints ahí. Se retira en PE-04B3.

## Cómo funciona

`tests/unit/pe04b3-bypass-guard.test.ts` recorre `lib`, `server`, `app` y
`components` buscando las cuatro maneras de escribir bytes que existen:

- el cliente de storage-js (`.upload(`)
- URL firmada (`createSignedUploadUrl`, `uploadToSignedUrl`)
- TUS (`storage/v1/upload/resumable`)
- cualquier petición directa a `storage/v1/object`

Todo camino que escriba tiene que estar declarado en `CAMINOS_PERMITIDOS`
diciendo **por dónde reserva**. Si aparece uno nuevo, la prueba se pone roja y
hay que decidirlo a conciencia.

Los comentarios se descartan antes de buscar: una mención en una explicación no
es una escritura, y confundirlas convierte un guardia en ruido que se acaba
ignorando.

## Los cinco caminos declarados hoy

| Archivo | Bucket | Reserva |
|---|---|---|
| `lib/storage/direct-upload.ts` | el que reservó el intent | `begin_cpr_storage_upload` — la ruta la decide la base y la política INSERT de Storage exige un intent propio y vigente |
| `lib/db/settings.ts` | `organization-assets` | `organization_storage_guard_logo` |
| `lib/db/textiles-evidences.ts` | `evidences` | `begin_textile_evidence_upload_v2` |
| `lib/db/tutorials-platform.ts` | `tutorial-media` | no aplica · bucket de plataforma |
| `lib/storage/resumable-upload.ts` | `tutorial-media` | no aplica · bucket de plataforma |

Además comprueba que ningún camino de cliente escriba en un bucket de
plataforma ni al revés, y que ninguno cambie de bucket a escondidas.

## Demostrado, no supuesto

Se creó un archivo nuevo con un `.upload(` a `evidences` sin declarar: la
prueba se puso **roja** señalando archivo y línea. Se retiró el archivo y
volvió a verde. Un guardia que no se ha visto fallar no es un guardia.
