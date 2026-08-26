# EXPORT-01 · El Print Model

Un PDF de Trazaloop no se escribe: se **describe**.

## Estructura

```
PrintDocument
 ├─ recordType, title, code, subtitle, badges
 ├─ organization  (nombre, razón social, NIT, logo YA decodificado)
 ├─ systemLine    («Trazaloop Quality · riesgos y oportunidades»)
 ├─ orientation   portrait | landscape
 ├─ generatedAt   inyectado, nunca del reloj
 ├─ appliedFilters + recordCount   (listados)
 ├─ sections[]    → blocks[]
 └─ footerNote
```

## Los bloques

| Bloque | Para qué |
|---|---|
| `heading` | Subtítulo dentro de una sección |
| `paragraph` | Texto corrido, con ajuste y salto de página |
| `fields` | Rejilla etiqueta/valor. Los `wide` van a ancho completo |
| `table` | Con encabezado repetido por página y texto vacío propio |
| `badges` | Estados y niveles. Color + palabra, nunca solo color |
| `timeline` | Qué pasó, cuándo, quién y por qué |
| `references` | **Distingue VIVA de HISTÓRICA en palabras** |
| `matrix` | Dos ejes derivados de una configuración, con bandas y leyenda |
| `hierarchy` | Árbol con sangría (organigrama, jerarquías) |
| `graph` | Categorías, nodos y relaciones legibles (mapa de procesos) |
| `note` | Aviso enmarcado |
| `rule`, `spacer`, `pageBreak` | Composición |

## Tres decisiones que se notan en el papel

**Las referencias se etiquetan.** Un bloque `references` imprime
`REFERENCIA VIVA` o `COMO ESTABA ENTONCES` sobre cada elemento. No es
decoración: decir «Indicador IND-003» cuando lo que se usó fue su configuración
de marzo es afirmar algo falso, y el lector no puede adivinarlo.

**La matriz no está cableada.** Recibe cabeceras, celdas y leyenda ya
calculadas por el dominio. Con dos dimensiones dibuja la cuadrícula; con otro
número deja de fingirla y muestra las bandas, porque una rejilla de dos ejes
mentiría sobre cómo se calculó el nivel.

**El mapa no es una captura.** `graph` dibuja las categorías con sus nodos y,
debajo, las relaciones con origen, destino y qué fluye. Un grafo de cajas y
flechas en A4 acaba ilegible con quince procesos; una tabla de relaciones se lee
y se audita.

## Qué NO puede llevar

Ninguna URL. Ningún HTML. Ningún identificador técnico. Ninguna función. El
modelo es datos, y el renderizador solo sabe dibujar datos.
