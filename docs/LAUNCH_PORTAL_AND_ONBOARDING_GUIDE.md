# Trazaloop · Portal de lanzamiento, onboarding Demo y consentimiento legal (Sprint 10D)

## 1. Qué es el portal público

`/` ahora es una página pública — accesible sin iniciar sesión — que
presenta Trazaloop y sus módulos: **Trazaloop CPR** (disponible) y
Trazaloop Textil / Quality / Construcción (próximamente, sin
funcionalidad todavía). Una sola cuenta de Trazaloop da acceso a todos
los módulos disponibles; nunca hay logins separados por módulo. El
portal deja claro que Trazaloop está en **beta / lanzamiento
controlado**.

## 2. Términos de uso y política de privacidad

`/terms` y `/privacy` son páginas públicas (sin sesión) que muestran el
documento legal **activo** de cada tipo. Ambos son marcados
explícitamente como **versión preliminar** — pueden actualizarse antes
del lanzamiento definitivo, y cualquier versión nueva exige una
aceptación nueva.

## 3. Aceptación obligatoria antes de entrar

Todo usuario —de empresa o de plataforma— debe aceptar los términos de
uso y la política de privacidad **vigentes** antes de entrar a
cualquier parte protegida de Trazaloop (`/dashboard`, `/modules`,
`/select-org`, la consola de plataforma, etc.). Si falta aceptar,
cualquier intento de navegación directa a esas rutas redirige a
`/legal/accept` — no hay forma de saltarse este paso navegando
directamente a una URL.

Además de la redirección en la interfaz, las acciones más sensibles
—crear una empresa, aceptar una invitación de equipo, actualizar tu
perfil— **también revisan la aceptación legal directamente en el
servidor**, sin confiar solo en que la página haya redirigido a tiempo.

El registro de cada aceptación (qué documento, en qué versión, cuándo)
se guarda **exclusivamente a través de una función controlada del
servidor** — nunca mediante una inserción directa desde el cliente. Esa
función es la única que decide cuáles son los documentos vigentes y sus
datos reales; el cliente nunca puede indicar qué documento o qué
versión está aceptando.

Si alguien llega desde un enlace de invitación de equipo, ese destino se
preserva: después de aceptar, vuelve automáticamente a la invitación en
vez de terminar en el flujo normal de creación de empresa.

## 4. Registro y creación de empresa

El registro (`/register`) sigue funcionando igual — Supabase Auth exige
confirmación de correo antes de abrir sesión. Después de confirmar y
aceptar los documentos legales, si la persona no tiene ninguna empresa
todavía, puede crear una desde `/select-org`. Toda empresa nueva creada
por un usuario normal **siempre queda en plan Demo** — nunca se acepta
un plan distinto desde el formulario de creación; el plan solo lo cambia
un superadministrador después, desde la consola de plataforma.

## 5. Onboarding después de crear una empresa

Una empresa **recién creada** va directo a `/onboarding` (nunca al panel
general sin contexto). Ahí se muestran 7 pasos calculados a partir de
datos reales:

1. Completar datos de empresa (razón social + NIT)
2. Tomar diagnóstico inicial
3. Crear producto objetivo
4. Registrar proveedor
5. Registrar materiales
6. Cargar una evidencia
7. Crear primer documento en TrazaDocs (documento vivo o archivo descargable del Maestro de documentos)

Cada paso tiene estado **pendiente**, **en progreso** o **completado** —
nunca se marca nada completo por defecto ni con datos inventados; todo
sale de si la empresa realmente tiene esos datos cargados. El paso 7 se
completa con un documento vivo **o** con un archivo descargable del
Maestro de documentos — el conteo de pasos completados y el porcentaje
de progreso usan exactamente el mismo criterio, así que nunca se
contradicen entre sí. Hay un octavo paso, «Revisar límites del plan
Demo», que es puramente de navegación — no se marca completo
automáticamente porque no hay ningún dato que indique si alguien revisó
una pantalla.

`/onboarding` sigue disponible en cualquier momento desde el menú
(Sistema → Onboarding), no solo justo después de crear la empresa.

## 6. Banner de plan Demo

En el panel principal (`/dashboard`) y en `/onboarding`, una empresa en
plan Demo ve un banner discreto invitándola a explorar la plataforma y a
contactar al equipo de Trazaloop si necesita más capacidad — **nunca
menciona pagos ni tarjetas de crédito**. Full y Extra no ven este
banner.

## 7. Aviso de cuenta suspendida o cancelada

Si la suscripción de la empresa no está activa (Sprint 10A), aparece un
aviso claro en el panel principal invitando a contactar a Trazaloop
desde el Centro de soporte — la única acción que sigue disponible para
crear tickets nuevos en ese estado es sobre cuenta/acceso o plan/límites
(Sprint 10C).

## 8. Qué ve el superadministrador

Desde el detalle de cada empresa en la consola de plataforma
(`/platform/organizations/[id]`), el superadministrador ve:

- El progreso de onboarding de la empresa (pasos completados / total).
- Quién de los miembros aceptó qué documento legal, en qué versión y
  cuándo — sin necesidad de preguntarle a la empresa.
- El resumen de tickets de soporte de esa empresa (Sprint 10C).

## 9. Qué NO cambia

Ninguna funcionalidad de trazabilidad, evidencias, cálculo de contenido
reciclado, TrazaDocs o soporte cambia con este sprint. No hay
verificación de correo adicional a la de Supabase Auth, no hay
CAPTCHA, no hay pasarela de pagos, no hay generación de PDF adicional,
y los módulos Textil/Quality/Construcción siguen sin ninguna
funcionalidad real — solo aparecen marcados como «Próximamente».
