# Trazaloop · Copy de landing pública y portal de módulos

> Sprint T0.2 — Solo documentación. Textos propuestos para corregir la comunicación
> pública en el Sprint T1 (DL-17/DL-21). Estado actual verificado en el código:
> `app/page.tsx` ya contiene las cuatro tarjetas de módulos, pero el **hero** dice
> "Trazaloop CPR" con la descripción del módulo CPR. El cambio de T1 es acotado:
> hero + descripción + botón "Entrar"; las tarjetas se ajustan mínimamente.

## 1. Hero de la landing pública

**Título principal (obligatorio):**

> Trazaloop

**Subtítulo — 3 opciones (elegir una):**

| Opción | Texto | Cuándo usarla |
|---|---|---|
| 1 · Técnica | "Plataforma modular para gestionar trazabilidad, documentación técnica, evidencias y preparación técnica de productos, procesos y cadenas de valor." | Default recomendado: describe capacidades sin prometer resultados. |
| 2 · Comercial | "Una sola plataforma, un módulo para cada cadena de valor: trazabilidad, evidencias y documentación técnica listas para crecer con tu empresa." | Campañas/material comercial; mantiene lenguaje prudente. |
| 3 · Prudente/regulatoria | "Plataforma modular de soporte documental y trazabilidad: organiza información, evidencias y brechas para preparar a tu empresa frente a requisitos técnicos y regulatorios, sin sustituir certificaciones ni auditorías." | Contextos donde la audiencia es regulatoria/técnica y conviene la advertencia explícita. |

**Recomendación**: Opción 1 en el hero; la aclaración de la Opción 3 puede ir como
línea secundaria pequeña bajo los CTAs o en el pie de la landing.

**Badge**: mantener "Beta / lanzamiento controlado" mientras aplique.

## 2. Tarjetas de módulos (sección "Módulos" de la landing y portal `/modules`)

| Módulo | Estado mostrado | Descripción propuesta |
|---|---|---|
| **Trazaloop CPR** | Disponible | "Trazabilidad, documentación técnica, evidencias y cálculo de contenido reciclado en procesos asociados a NTC 6632 y UNE-EN 15343." |
| **Trazaloop Textil** | Próximamente (público) / Privado (organizaciones habilitadas) | "Trazabilidad de productos de confección, composición de fibras, evidencias, circularidad y pasaporte técnico textil." |
| **Trazaloop Quality** | Próximamente | "Gestión documental y soporte para sistemas de gestión de calidad." |
| **Trazaloop Construcción** | Próximamente | "Trazabilidad documental y técnica para productos, materiales y proyectos de construcción." |

Notas:
- La tarjeta Textil solo enlaza a `/textiles` para usuarios de organizaciones con
  el módulo habilitado y el flag encendido (DL-02/DL-03); para el público general
  permanece "Próximamente".
- La descripción de CPR conserva sus normas porque son **del módulo**; ninguna
  norma de módulo sube al hero de plataforma.
- Los estados de tarjeta se leen del catálogo `modules`/activación, no se codifican
  a mano cuando exista el acceso por módulo.

## 3. Botones y CTAs

| Botón | Texto | Comportamiento |
|---|---|---|
| Entrar | "Entrar" | A `/modules` con sesión, a `/login` sin sesión. Es el acceso a **la plataforma** (hoy el código lo comenta como "Entrar de Trazaloop CPR"; ese comentario/semántica se corrige en T1). |
| Crear cuenta | "Crear cuenta Demo" | A `/register`. "Demo" aquí es la **cuenta de usuario** (ver semántica en `TRAZALOOP_MODULE_ACCESS_MODEL.md` §5). |
| Ver módulos | "Ver módulos" | Ancla a la sección de módulos de la landing (o `/modules` con sesión). |
| Módulo no disponible | "Próximamente" | Deshabilitado; tooltip/mensaje: "Este módulo estará disponible próximamente." (texto ya existente, se conserva). |
| Solicitar acceso (futuro) | "Solicitar acceso" | Solo cuando exista el flujo comercial correspondiente; mientras tanto no se muestra. |

## 4. Lenguaje prohibido en toda comunicación pública

- No decir que Trazaloop **certifica** (productos, procesos, empresas).
- No decir que **garantiza cumplimiento** (de ninguna norma o marco regulatorio).
- No decir que **reemplaza auditorías** ni organismos de certificación.
- No decir que emite o garantiza el **pasaporte digital oficial** (DPP UE).
- No presentar **CPR como toda la plataforma** (ni en título, ni en metadatos, ni
  en textos de botones).
- No afirmar compatibilidad GS1/EPCIS ni integraciones no implementadas.
- Vocabulario permitido: preparación, soporte documental, trazabilidad, evidencias,
  brechas, revisión técnica interna, "asociado a" / "con referencia a" una norma.

## 5. Base normativa y referencias internacionales

| Funcionalidad | Norma o marco de referencia | Cómo se aplica | Qué NO debe prometer |
|---|---|---|---|
| Copy de plataforma y módulos | N-05 (ISO 14021) como guía de autodeclaraciones prudentes | Todo texto público pasa el filtro del §4; el copy de CPR cita sus normas como "procesos asociados a", no como cumplimiento. | Certificación, cumplimiento, sustitución de auditoría, DPP oficial. |

## 6. Riesgos

| Riesgo | Mitigación |
|---|---|
| El hero vuelva a acoplarse a un módulo en rediseños futuros (R-17) | DL-16/DL-17 como decisiones cerradas; test de contenido en T11 puede incluir el hero. |
| Traducciones/materiales externos usen lenguaje prohibido | §4 es la lista de control para cualquier material, no solo la landing. |

## 7. Criterios de aceptación

- [ ] Hero, subtítulos, tarjetas y botones propuestos completos y consistentes con
  DL-16…DL-21.
- [ ] Ningún texto propuesto contiene lenguaje del §4.

## 8. Próximos pasos

1. Elegir subtítulo (recomendado: Opción 1) al ejecutar T1.
2. Aplicar los textos en `app/page.tsx` durante T1 (cambio acotado al hero y
   ajustes mínimos de tarjetas), según `TEXTILES_T1_READY_PROMPT_REVISED.md`.
