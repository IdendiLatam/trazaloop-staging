# PE-03B2 · Subir un vídeo

> **SUPERSEDED BY PRODUCT OWNER DECISION · 31 de agosto de 2026**
>
> Este documento describe el tope de **200 MB por archivo** que regía cuando se
> escribió. El propietario del producto lo **revocó en PE-03B3, sin sustituirlo
> por otro número**, y también dejó dicho que Trazaloop **no impone una duración
> máxima**.
>
> El texto se conserva tal como se escribió: es el informe de lo que se hizo
> entonces, y reescribirlo dejaría sin explicación las decisiones que sí se
> tomaron con esa regla puesta. Lo que hoy rige está en
> [PE_03B3_LARGE_MEDIA_ARCHITECTURE.md](PE_03B3_LARGE_MEDIA_ARCHITECTURE.md).


---

## 1 · Los cuatro pasos, y dónde ocurre cada uno

```
navegador          servidor              Storage
    │
    │  elegir archivo
    │─── reservar ────▶  autoriza, elige la ruta,
    │                    fija tamaño y tipo esperados
    │◀── token para ──── una ruta y quince minutos
    │
    │═══ los bytes ══════════════════════════════▶
    │
    │─── finalizar ───▶  lee el objeto REAL
    │                    compara con lo reservado
    │◀── verificada ───  o fallida
```

**Los bytes no atraviesan Next.js.** No es una preferencia: `next.config.ts`
dejó las Server Actions en 1 MB cuando T9E.1 cambió el transporte, y hay pruebas
que fallan si alguien lo reintroduce. Lo que sí atraviesa el servidor son tres
mensajes cortos.

---

## 2 · Lo que ve quien sube

Seis estados, con el nombre que significa algo para quien mira:

| | |
|---|---|
| `idle` | Seleccionar archivo |
| `reserving` | Preparando… |
| `uploading` | Subiendo… |
| `verifying` | Verificando el archivo… |
| `done` | **Listo para revisar** |
| `error` | No se pudo subir |

**El último no se llama «Publicado», y esa es la decisión.** Quien sube un vídeo
y ve «completado» piensa que la gente ya lo está viendo. Hay una comprobación que
falla si alguna etiqueta contiene «publicad».

Y el formulario lo dice antes de empezar: *subir **no publica**: la versión queda
lista para revisar y se publica después*.

El estado se anuncia con `role="status"` y `aria-live`, y **no se dice solo con
un color**: lleva su símbolo y su texto.

---

## 3 · Lo que se acepta, y las tres veces que se comprueba

`.mp4` y `.webm`, hasta 200 MB.

> **SUPERSEDED · PE-03B3.** El tope de 200 MB ya no existe.

| Dónde | Qué comprueba |
|---|---|
| El campo `accept` | filtra el diálogo del sistema |
| El navegador, antes de llamar | evita un viaje inútil |
| La acción del servidor | extensión, tipo y tamaño |
| `tutorial_reserve_upload` | los tres otra vez |
| El `CHECK` de la tabla | ni escribiendo directo |
| **El `file_size_limit` del cubo** | ni con una URL firmada |
| La finalización | **la firma binaria del archivo real** |

La validación del navegador es cortesía. **La autoritativa es la del servidor y
la del cubo**, y la del cubo es la única que un token firmado no rodea.

---

## 4 · Los errores, traducidos

Nunca se enseña el texto crudo del almacenamiento. «new row violates row-level
security policy» no le dice a nadie qué hacer, y de paso cuenta cómo está
construido por dentro.

| Lo que pasa | Lo que se lee |
|---|---|
| La reserva caducó | «La reserva de subida caducó. Vuelve a empezar; el archivo no se perdió de tu equipo.» |
| El almacenamiento rechazó | «El almacenamiento rechazó la subida. Vuelve a empezar.» |
| Demasiado grande | «El vídeo supera el tamaño máximo permitido (200 MB).» |
| Formato no admitido | «Solo se admiten vídeos en formato MP4 o WebM.» |
| No cuadró con lo reservado | «El archivo subido no coincide con lo reservado. Vuelve a intentarlo.» |

> **SUPERSEDED · PE-03B3.** El tope de 200 MB ya no existe.

Y siempre queda un botón de **Volver a intentarlo**.

---

## 5 · Si la subida se cae

La reserva **se marca fallida** en vez de quedarse viva. Una reserva viva es una
ruta que sigue admitiendo escritura, y una que caducó sola no se distingue de una
que nunca existió.

Una versión fallida:
- no se ve en ninguna parte;
- **no se puede publicar** — el `CHECK` exige `verified` para tener vigencia;
- aparece en «Subidas sin terminar», para poder descartarla.

### Si se recarga la página a mitad

No pasa nada raro, y eso es deliberado: **el estado vive en la base, no en el
navegador**. La reserva sigue siendo una reserva y la versión sigue sin
verificar. Nadie ve un vídeo a medias, y nada queda marcado como publicado.

Se puede volver a empezar con una reserva nueva. **No hay subida reanudable**, y
no se finge que la haya: si Storage la ofreciera de balde se usaría, y no la
ofrece.

---

## 6 · Doscientos megas tardan

No se bloquea la plataforma: el resto de la consola sigue respondiendo, porque lo
único ocupado es la pestaña que sube.

**Y no se promete un proceso en segundo plano que no existe.** El estado que se
enseña es el real de la subida del navegador. Si se cierra la pestaña, la subida
se interrumpe — y la reserva caduca sola.

---

## 7 · La frontera de autorización, otra vez

PE-03A comprobó, y 0099 lo tenía escrito, que **una URL de subida firmada
autoriza por sí misma**: funciona incluso desde un cliente anónimo y no pasa por
la política INSERT de Storage.

Así que lo que impide subir un tutorial **no es la política del cubo**. Es que
solo `reserveTutorialUploadAction` emite la ruta que se va a firmar, y solo la
emite a un superadministrador.

Lo que baja al navegador es **un token para una ruta y un rato**. No es una
credencial de escritura sobre el cubo: no sirve para otra ruta ni para otro
momento. Hay una comprobación que verifica que una persona normal no consigue
reserva, y que sin reserva no puede firmar una ruta inventada.
