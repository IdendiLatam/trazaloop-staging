# Marcas de terceros

Los archivos de esta carpeta **no son de Trazaloop**. Son marcas registradas de
sus dueños y están aquí porque su titular publica un kit descargable para que
los comercios los usen. No se redibujan, no se recolorean y no se recortan: se
sirven tal cual llegaron.

## wompi.svg

| | |
|---|---|
| Origen | https://www.wompi.co/es/co/desarrolladores/recursos-graficos |
| Archivo | `/assets/downloadble/logos_wompi/Wompi_LogoPrincipal.svg` |
| Versión | Logo Principal (monocromo `#2C2A29`, fondo transparente) |
| Descargado | 2026-09-04 |
| SHA-256 | `e860a654d307f4d47e367569904c0ba67e6ac38eef57c8142fe8ab812b5e614a` |
| Revisado | sin scripts, sin `foreignObject`, sin referencias remotas |

### El área de seguridad ya viene dentro

Wompi pide **40 px mínimos** entre su logotipo y cualquier otro elemento. El
archivo oficial trae ese margen incorporado: la marca ocupa 1286 × 302 unidades
centradas en un lienzo de 1982 × 997, con **348 unidades exactas de aire por los
cuatro lados**.

Eso convierte la regla en aritmética: el margen renderizado es `0,349 × alto`,
así que basta con dibujar el archivo a **116 px de alto o más** —232 px de
ancho— para que el aire real supere los 40 px. Por eso el panel lo pinta a
`14,5rem` de ancho con el alto derivado del `viewBox`: la proporción no se toca
y el área de seguridad se cumple sola.

## Lo que NO se incorporó

El sello oficial de la certificación PCI (`/assets/downloadble/logos_pci/PCI.svg`)
existe y es descargable, pero no se usa: puesto dentro de un panel de Trazaloop
se leería como si la certificación fuera nuestra, y no lo es. La frase del panel
se la atribuye a quien la tiene.
