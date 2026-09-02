# PE-04B5 · La consola comercial

## Dónde está

`/platform/plans` · **«Planes y uso»**, con entrada visible desde la portada de
plataforma. No es accesible para usuarios de empresa.

| Rol | Puede |
|---|---|
| Superadministración | leer y **administrar** |
| Soporte | **solo lectura** — necesita saber qué tiene contratada una empresa para atenderla |
| Cliente | nada |

La pantalla lo dice cuando estás en solo lectura, y **la base lo vuelve a
comprobar por su cuenta**: las políticas de escritura del catálogo exigen
`is_platform_superadmin()`. La pantalla no es la barrera.

> Nota metodológica: la primera versión de la prueba de este punto daba verde
> por accidente. Un `UPDATE` que la RLS filtra **no devuelve error**: devuelve
> cero filas afectadas. Comprobar solo el error habría dejado pasar un agujero
> real. La prueba final comprueba el **efecto**: lee el valor antes y después.

## Qué enseña

Para Free, Full y Extra: la revisión vigente, su precio mensual y anual, y sus
condiciones con **etiquetas humanas** —Almacenamiento, Créditos de Intelligence,
Uso diario, Uso mensual, Orientación funcional—, no `ai_weighted_credits_monthly`.
Quien decide precios no tiene por qué leer el esquema.

Los precios se muestran siempre con la advertencia de que son **antes de
impuestos**. No se calcula IVA y no se cobra nada: eso es PE-05.

«Sin configurar» se enseña como *sin configurar*, nunca como cero ni como «sin
límite»: es que nadie lo ha decidido, y el producto lo trata como una negativa.

## Lo que no aparece

No hay plan **Demo** —no existe comercialmente— y **Advisor no es un plan**. El
Acompañamiento especializado se nombra en la propia pantalla como servicio
aparte, con su contratación propia, y no se administra aquí.

## Revisiones

Una revisión **publicada no se edita**: lo que ya se le ofreció a alguien es
historia, y reescribirla cambiaría lo que esa empresa contrató. La base lo impide
con un disparador y la pantalla lo dice.

Para cambiar condiciones se crea una **sucesora en borrador**, que nace copiando
la vigente —incluidos sus límites—. Un borrador vacío haría que publicar por
error dejara media docena de recursos «sin configurar», y sin configurar niega.

La **historia** completa se conserva y se puede desplegar: revisión 1 de B1 sigue
ahí junto a la 2 de B2. Lo que se ofreció antes no se esconde.

## Publicar

Exige confirmación escrita y enseña, **en palabras**, qué cambia: precio mensual,
precio anual y cada condición, con su antes y su después. Confirmar sobre un JSON
no es confirmar: es pulsar «sí» sobre algo que nadie leyó.

## La regla histórica

**Publicar una revisión nueva NO mueve a las empresas ya asignadas a la
anterior.** Su asignación sigue apuntando a *su* revisión; la nueva pasa a ser la
oferta vigente del catálogo y la base de las asignaciones futuras.

Mover a una empresa es una **transición comercial explícita**, con motivo. La
pantalla lo advierte justo antes de publicar, y hay una prueba que comprueba que
publicar no toca ninguna asignación existente.
