# PE-01A · ESPECIFICACIÓN DE LA PUERTA DE TRAZALOOP

Ruta `/modules`. Copy final propuesto en español. Sin implementar.

---

## 1 · Escritorio

```
┌──────────────────────────────────────────────────────────────────┐
│  Trazaloop                       [● Andina S.A.S.]  cambiar      │
├──────────────────────────────────────────────────────────────────┤
│  Una cuenta, varios módulos. Entra al que necesites.             │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  Activo                                                    │  │
│  │  Trazaloop Quality                                         │  │
│  │  Tu sistema de gestión: procesos, riesgos, objetivos,      │  │
│  │  personas, proveedores, auditorías y mejora continua,      │  │
│  │  con todo conectado y con trazabilidad de cada decisión.   │  │
│  │                                                            │  │
│  │  [ Entrar a Quality → ]                                    │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  Módulos especializados                                          │
│  ┌───────────────┐ ┌───────────────┐ ┌───────────────┐           │
│  │ Prueba · 2 d  │ │ No incluido   │ │ Próximamente  │           │
│  │ Trazaloop PCR │ │ …Textiles     │ │ …Construcción │           │
│  │ Contenido     │ │ Trazabilidad  │ │ Trazabilidad  │           │
│  │ reciclado…    │ │ textil…       │ │ para obra…    │           │
│  │ [ Entrar → ]  │ │ Vence…        │ │               │           │
│  └───────────────┘ └───────────────┘ └───────────────┘           │
└──────────────────────────────────────────────────────────────────┘
```

Quality **ancho completo**; los tres especializados en una fila de tres. La diferencia de
tamaño es la jerarquía: no hace falta un adorno para decir cuál es el principal.

---

## 2 · Móvil

Mismo orden, apilado. Quality primero y entero; después el rótulo «Módulos especializados»
y las tres tarjetas una debajo de otra. **Sin desplazamiento horizontal** y sin carrusel:
tres tarjetas no se navegan, se leen.

---

## 3 · El copy

### Frase de la plataforma

> **Una cuenta, varios módulos. Entra al que necesites.**

Sin «plataforma modular multiempresa», sin ERP, sin QMS, sin siglas.

### Quality · protagonista

> **Trazaloop Quality**
> Tu sistema de gestión: procesos, riesgos, objetivos, personas, proveedores, auditorías y
> mejora continua, con todo conectado y con trazabilidad de cada decisión.

Qué hace y **no** promete: no dice ISO, ni certificación, ni conformidad, ni «cumple».
Menciona gestión de la calidad sin prometer que la acredite. Y describe lo que hay hoy
—trece dominios integrados tras QUALITY-13—, no lo de QUALITY-01.

> ⚠️ La descripción del catálogo (`lib/modules/catalog.ts`) se quedó en «cargos, procesos
> con revisiones vigentes… y mapa de procesos publicable». Es de hace trece sprints.

### PCR

> **Trazaloop PCR**
> Trazabilidad de contenido reciclado en plásticos: de la materia prima al lote producido,
> con las evidencias que respaldan cada declaración.

Sin dos normas en el titular. Van dentro del módulo.

### Textiles

> **Trazaloop Textiles**
> Trazabilidad de prendas y composición de fibras, con evidencias, circularidad y pasaporte
> técnico.

### Construcción

> **Trazaloop Construcción**
> Trazabilidad para el sector construcción. Todavía no está disponible.

### Empresa sin módulos

> **Tu cuenta está activa y ahora mismo no tienes ningún módulo disponible.**
> Tus datos se conservan. Abajo están los módulos de Trazaloop y el estado de cada uno.

### Cuando no se puede comprobar

> **No fue posible comprobar tu acceso a este módulo.** Vuelve a intentarlo.

Nunca «no lo tienes».

---

## 4 · Contrato de la tarjeta

| Campo | Obligatorio | De dónde sale |
|---|---|---|
| nombre | sí | catálogo |
| descripción | sí | catálogo *(hay que reescribir dos)* |
| estado | sí | `derivedState` |
| detalle del estado | cuando aporta | vencimiento, días restantes |
| entrada | solo si `isEnterableState` **y** hay `homePath` | catálogo |
| límite del plan | **no** | hueco para PE-04 |
| «Ver planes» | **no** | hueco para PE-05 |

**No** llevan precio, ni almacenamiento, ni cuota de IA. No ayudan a decidir a cuál entrar,
que es la única pregunta de esta pantalla.

---

## 5 · El shell · empresa y módulo

```
[● Andina S.A.S.]  cambiar          Trazaloop Quality   Ver módulos
```

Dos identidades, dos acciones, y ninguna ambigüedad sobre cuál es cuál. **En móvil también**:
hoy volver al selector exige abrir el menú lateral.

Se conserva «⇄ Cambiar de módulo» al pie del menú: quitar una salida conocida no aporta.

---

## 6 · La banda de pruebas

Sale del `layout`. Pasa a:

- la **Home**, hablando de módulos concretos;
- la **tarjeta** del módulo afectado;
- **dentro** de un módulo, solo si ese módulo está en prueba o vencido.

Quien trabaja en Quality con acceso completo **no** vuelve a leer que su prueba terminó.

---

## 7 · Accesibilidad

- Un módulo entrable es un **enlace**; uno bloqueado es un **`article`**, no un enlace
  deshabilitado. Un enlace que no lleva a ningún sitio es peor que la ausencia de enlace.
- `h1` de la página → `h2` de cada zona → `h3` de cada módulo, sin saltos.
- Estado con **texto**, nunca solo color.
- Foco visible y orden de tabulación igual al visual: Quality primero.
- El esqueleto de carga se anuncia (`aria-busy`); el fallo, con `role="status"`.
- Construcción es contenido inerte, **no** un enlace roto.

---

## 8 · Lo que esta pantalla NO hace

No vende, no cobra, no explica planes, no enseña vídeos, no responde preguntas y no decide
roles. Cuatro módulos, su estado y una puerta.
