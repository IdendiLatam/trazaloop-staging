# PE-02B3 · Los dos arrastres de PE-01, cerrados

PE-01 los aceptó como no bloqueantes y los dejó para PE-02. Aquí se cierran.

---

## Carryover-01 · La jerarquía de la portada pública

### Cómo estaba

Cuatro tarjetas del mismo tamaño en `grid gap-4 sm:grid-cols-2`: PCR, Textiles,
Quality, Construcción. Quien llegaba veía cuatro cosas iguales y no sabía por
dónde empezar — el mismo problema que PE-01B arregló en la puerta y que en la
portada seguía intacto.

### Cómo está

```
┌──────────────────────────────────────────────┐
│  [Disponible]                                │
│  Trazaloop Quality              ← text-3xl   │   ancho completo
│  Gestiona procesos, riesgos, objetivos,      │
│  personas, proveedores, auditorías y mejora  │
│  continua desde un entorno conectado y       │
│  trazable.                                   │
│  [ Entrar a Quality → ]                      │
└──────────────────────────────────────────────┘

Módulos especializados
┌───────────────┐ ┌───────────────┐ ┌───────────────┐
│ Trazaloop PCR │ │ …Textiles     │ │ …Construcción │
│ [Disponible]  │ │ [Disponible]  │ │ [Próximamente]│
│      Entrar → │ │      Entrar → │ │ Todavía no    │
└───────────────┘ └───────────────┘ └───────────────┘
```

- Quality va **antes en el documento**, así que en una pantalla estrecha sigue
  siendo lo primero sin necesidad de reordenar nada.
- Los tres especializados en `sm:grid-cols-2 lg:grid-cols-3`; se apilan solos.
- Construcción es **inerte de verdad**: ni enlace, ni botón deshabilitado —los
  dos se anuncian como algo pulsable y frustran igual—. Dice «Todavía no está
  disponible».

### De dónde salen los datos · PEH-19

De `lib/modules/entry.ts` (`heroModule`, `specializedModules`, `ENTRY_COPY`), que
lee el catálogo canónico. **Ni un nombre de módulo escrito a mano en la
portada**, y hay una prueba que lo comprueba contra los cuatro nombres del
catálogo.

Esa reutilización destapó dos cosas:

1. **Las normas de PCR habían desaparecido.** PE-01B las quitó de la frase; en la
   portada seguían porque el texto estaba escrito a mano. Se devolvieron a la
   frase canónica.
2. **Cinco pruebas comprobaban literales del archivo** en vez de promesas —«la
   portada contiene la cadena "Trazaloop Quality"»—. Se corrigieron para
   comprobar lo que prometen; una de ellas, además, llevaba tiempo pasando por
   casualidad (ver la matriz de pruebas §5).

### El estado que se enseña

«Disponible» y «Próximamente» son estados **de producto**: qué existe en
Trazaloop. Nunca el estado comercial de una empresa —quien mira no ha entrado—.
Comprobado: la portada no resuelve acceso de nadie y no enseña «No incluido»,
«Acceso suspendido» ni «No se pudo verificar».

### Lo que NO se tocó

El hero de plataforma, el flujo de registro, «Crear cuenta Demo» y su kill
switch, el pie legal, y el nombre «Demo» — renombrarlo es PE-04.

---

## Carryover-02 · La copia de `/modules`

### Decía

> El estado de cada módulo se resuelve con la **hora del servidor** y con lo que
> tu empresa tiene hoy. Entrar a un módulo no decide qué puedes hacer dentro: eso
> lo determina tu rol.

Era cierta, y era vocabulario interno. «Hora del servidor» explica **cómo** se
calcula algo a quien solo preguntaba **qué** tiene.

### Dice

> Los módulos disponibles dependen del acceso de tu empresa. Dentro de cada
> módulo, tu rol define las funciones que puedes usar.

Texto congelado por decisión humana, adoptado tal cual. Vive en
`MODULE_ACCESS_FOOTNOTE` (`lib/modules/entry.ts`), junto a las demás frases de la
puerta.

**La regla no cambia**: el estado se sigue resolviendo con la hora del servidor y
el papel sigue decidiendo lo de dentro. Lo que cambia es que dejamos de
contárselo a quien no preguntó.

Y al lado, ahora, un enlace a las preguntas frecuentes: es donde se aterriza tras
entrar, y es donde se buscan las respuestas.

### La regla que se deriva

**En la copia visible no aparece vocabulario interno**: «hora del servidor»,
«entitlement», «RLS», «tenant», «kill switch», «derivedState». Hay una prueba
estática que lo comprueba sobre los textos que se pintan —no sobre los
comentarios, que sí pueden nombrarlos para explicar por qué se retiraron— y una
por HTTP que lo comprueba sobre el HTML servido.
