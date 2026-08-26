# EXPORT-01.1 · Seguridad

> 53 exportaciones nuevas y **ningún camino nuevo**. Todas pasan por la misma
> puerta que abrió EXPORT-01.

## Lo que NO cambió, y es el punto

| | |
|---|---|
| Endpoint | Sigue habiendo **uno**: `/export/[key]` |
| Registro | Sigue **cerrado**: el navegador solo puede nombrar una clave de la lista |
| Empresa | Sigue saliendo de la **sesión**, nunca de la petición |
| Puertas | Registro → entitlement → rol → RLS, en ese orden |
| Cabeceras | `private, no-store`, `nosniff`, `attachment` |
| Nombres | Compuestos en un solo sitio, saneados dos veces |
| Logo | Resuelto en servidor desde el bucket privado de esa empresa |

Cuatro pruebas nuevas lo fijan: **D1** falla si aparece cualquier ruta de
descarga fuera del endpoint único; **D2** falla si un adaptador usa la clave de
servicio; **D3** falla si un adaptador lee la empresa de la petición; **D4**
falla si el endpoint deja de exigir sesión, empresa activa o entitlement.

## El módulo `core`, y por qué no es un agujero

Tres exportaciones nuevas —empresa, equipo, soporte— no pertenecen a Quality, ni
a PCR, ni a Textiles: pertenecen a la cuenta. Su módulo es `core` y el endpoint
**declara explícitamente** que `core` no exige entitlement de módulo.

Eso no las deja sin protección: siguen exigiendo sesión, empresa activa, rol y
RLS. Lo que se evita es lo contrario —colgarlas de un módulo arbitrario— que
habría hecho que una empresa sin PCR no pudiera descargar sus propios datos.

El listado de equipo exige rol `governor`: quién está en la empresa y con qué
permiso no es información de cualquiera.

## Las tres fichas que más cuidado exigían

### Datos de la empresa

Es la que más tentación daba de colar metadatos «útiles». Lleva **solo** lo que
el usuario ya ve en su pantalla de ajustes: nombre, razón social,
identificación, país, contacto, dirección, sitio y si hay logo cargado.

Una prueba (`C4`) recorre el bloque del adaptador y falla si aparece
`billing`, `stripe`, `password`, `token`, `secret` o `hash`.

### Equipo

Cada invitación tiene un **token de un solo uso**. El listado imprime correo,
rol, estado y vencimiento — y no el token. Una prueba (`C5`) falla si vuelve a
aparecer.

### Ticket de soporte

Los mensajes de la plataforma marcados como **nota interna** no son del cliente:
se filtran antes de imprimir.

## Ataques probados contra las familias nuevas

| Intento | Resultado |
|---|---|
| Clave inventada del módulo `core` | 404 |
| Ficha de empresa con `organization_id` de otra empresa | 200 con **los datos propios**: el parámetro se ignora |
| Acción de otra empresa por identificador | 404 |
| Control de otra empresa por identificador | 404 |
| Expediente PCR de otra empresa | 404 |
| Pasaporte textil de otra empresa | 404 |
| Documento TrazaDocs de otra empresa | 404 |
| Ficha de empresa sin sesión | redirección, nunca un PDF |
| PCR pedido por una empresa **sin el módulo** | 403 |
| Textiles pedido por una empresa **sin el módulo** | 403 |
| Quality pedido por una empresa **sin el módulo** | 403 |

Los que devuelven 200 se verificaron **abriendo el PDF**: la diferencia entre
«el parámetro se ignoró» y «el parámetro se obedeció» no se ve en el código de
respuesta.

## Entitlement, otra vez

Conocer una clave y un identificador **no** concede acceso. Es la comprobación
que separa «este PDF existe» de «tu empresa lo puede tener», y sigue siendo una
capa distinta de la autorización por rol.

Las dos exportaciones documentales de TrazaDocs son el caso interesante: la de
PCR exige entitlement de PCR y la textil exige entitlement de Textiles, aunque
compartan el mismo motor. El motor es común; el permiso no.

## Filtros

Los filtros nuevos siguen la misma regla: solo pasan las claves que la
exportación **declara**, con su tipo. El texto se limpia de caracteres de
control —acaba en el encabezado del PDF y viaja dentro de una cabecera HTTP— y
se limita a 120 caracteres.

La lección de EXPORT-01 quedó fijada por prueba (`C7`): los filtros del maestro
documental llevan **los nombres de la pantalla** y se aplican con la **misma
función** del dominio. Inventar nombres propios es lo que hace que el usuario
filtre, descargue y reciba la lista completa sin que nada se lo diga.
