# EXPORT-01.2 · Matriz de pruebas

| Suite | Qué comprueba | Resultado |
|---|---|---|
| `npm run test:export012` | El encabezado corporativo, sobre PDF reales | **28 conformes, 0 fallos** |
| `npm run test:export011` | La cobertura universal sigue intacta | **31, 0** |
| `npm run test:export01` | El motor de EXPORT-01 sigue intacto | **54, 0** |
| `npm run test:quality02` | Los 70 asertos del PDF documental heredado | **70, 0** |
| `npm run test:quality031` | Logo, proporción y no-regresión de identidad | **37, 0** |
| Validación en Staging | Con un logo REAL en el bucket privado | **23, 0** |
| `npm run test:all` | Regresión completa | **exit code 0** |

---

## Los seis grupos

### A · El contrato (6)

- `A1` · **las 85** definiciones declaran nombre documental.
- `A2` · el nombre es humano: empieza en mayúscula, tiene cuerpo y no repite la
  clave técnica.
- `A3` · la nomenclatura histórica no revive: ni «CPR», ni «lote de salida», ni
  «orden de producción» sin «corrida».
- `A4` · un `.list` se llama «Listado» (o «Lista maestra», «Maestro»,
  «Reporte»). Una ficha no puede llamarse listado ni al revés.
- `A5` · el **tipo** lo exige: `documentName: string` sin `?`, y existe
  `PrintDocumentDraft` para que el adaptador no pueda ponerlo.
- `A6` · el endpoint lo completa desde la definición.

### B · Ningún PDF se salta el encabezado (3)

`B1` es la comprobación que da nombre al sprint. Recorre `lib`, `app`, `server`
y `components` buscando cualquier `new PdfLayout(` o `new PdfWriter(`; solo
tres archivos pueden tenerlo, y los dos motores tienen que llamar a la
primitiva. **PDF_BYPASS_HEADER = 0.**

`B2` prohíbe cualquier interruptor (`showHeader`, `skipHeader`…) y que el
encabezado dependa del número de página. `B3` exige nombre documental también en
las dos rutas heredadas.

### C · Los tres elementos, en todas las páginas (7)

- `C1` · una página lleva empresa y nombre documental.
- `C2` · con logo: se dibuja tantas veces como páginas hay, y el archivo
  contiene **dos** objetos de imagen, no uno por página.
- `C3` · **240 filas**: cada página lleva los tres elementos.
- `C4` · la primera y la última fila siguen estando: el encabezado no se come el
  cuerpo.
- `C5` · apaisado, multipágina: igual.
- `C6` · el documento controlado heredado: encabezado en todas, y el **título
  real** sigue apareciendo aparte del nombre documental (§15).
- `C7` · la lista maestra heredada: igual.

**Estas comprobaciones tienen dientes.** Se verificó volviendo a dibujar el logo
solo en la primera página: fallan cuatro, nombrando «el logo aparece en 1 de 6
páginas».

### D · Sin logo y con logo roto (4)

- `D1` · sin logo: no hay objeto de imagen, está el nombre, y **no** hay aviso
  de logo roto.
- `D2` · logo declarado e inutilizable: el aviso aparece, y en **todas** las
  páginas.
- `D3` · el aviso no menciona bucket, storage, supabase ni la ruta; sí dice
  dónde arreglarlo.
- `D4` · el resolutor distingue los tres veredictos en origen.

### E · Formatos, proporción y textos largos (5)

- `E1` · todo MIME aceptado al subir (`image/png`, `image/jpeg`, `image/webp`)
  se resuelve para el encabezado, directamente o por conversión.
- `E2` · proporción respetada en 600×100, 100×600, 300×300 y 20×10, sin salirse
  de la caja.
- `E3` · nombre de empresa de 95 caracteres: se ajusta y no tapa el nombre
  documental.
- `E4` · nombre documental de 100 caracteres: se señala, no se recorta mudo.
- `E5` · saltos de línea en el nombre de la empresa: el PDF sale íntegro y
  ningún carácter de control llega al papel.

### F · Nada del navegador (3)

`F1` el endpoint no lee empresa, logo ni nombre documental de la petición.
`F2` la primitiva no contiene `fetch`, `http`, cliente de base ni storage.
`F3` el resolutor sigue partiendo de la fila de la empresa y comprobando que la
ruta le pertenece.

---

## Validación contra Staging · 23 comprobaciones

Con un **PNG real subido al bucket privado** por la misma vía que la pantalla de
Datos de empresa: `{org}/logo/logo.png` y la fila apuntando a él.

| Bloque | Qué demuestra | Nº |
|---|---|---|
| 14 exportaciones de las cinco familias | logo en **todas** las páginas, nombre de empresa y nombre documental exacto | 14 |
| 250 materiales | **10 páginas, logo 10/10, 2 objetos de imagen**, primera y última fila presentes | 1 |
| Empresa sin logo | Sin objeto de imagen, con nombre, **sin aviso falso** | 1 |
| Logo declarado y corrupto | El PDF **lo dice**, no incrusta basura y no revela el almacenamiento | 1 |
| `organization_id` + `companyName` + `logoUrl` + `documentName` en la URL | **Todos ignorados**: sale la marca de la sesión y el nombre documental real | 1 |
| PDF de B | No lleva la marca de A | 1 |
| Ruta heredada `/quality/documents/master/pdf` | Encabezado en todas las páginas | 1 |
| Limpieza | Logos y empresas efímeras retirados | 2 |
| Cuentas QA permanentes | Las tres siguen | 1 |

### Rendimiento (§46)

**10 páginas · logo dibujado 10 veces · 2 objetos de imagen · 118 KiB.** El logo
se resuelve y decodifica una vez por documento, se registra una vez en el
archivo y cada página lo referencia. Ni una descarga por página.

## Muestreo visual

PDF rasterizados y mirados, no solo parseados:

| Muestra | Qué se comprobó a ojo |
|---|---|
| Ficha de proceso (local) | Logo, empresa, FICHA DE PROCESO, código a la derecha, regla, cuerpo debajo |
| Listado apaisado (local) | Encabezado completo en apaisado, tabla sin tapar |
| Documento controlado (local) | Encabezado corporativo **y** el título real debajo |
| Logo roto (local) | El aviso visible, sin hueco de imagen |
| **Datos de la empresa (Staging, logo real)** | El logo subido al bucket **aparece dibujado** en el encabezado |

Sin OCR: se rasterizó con Quick Look y se miró la imagen.

> **Límite honesto.** El rasterizador disponible en esta máquina renderiza la
> primera página de un PDF. La evidencia de que el encabezado está en **todas**
> las páginas es el análisis del flujo de contenido página por página —`C3`,
> `C5`, `C6`, `C7` y la comprobación de Staging—, que es más estricto que mirar
> una miniatura y que se verificó capaz de fallar.
