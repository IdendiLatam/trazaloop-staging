/**
 * Trazaloop · PROD-LAUNCH-01C.4 · Vencer una prueba no es perder la información.
 *
 *
 * EL DEFECTO QUE ESTO CIERRA
 *
 * «Empresa de Prueba 1» tenía Quality, Textiles y PCR en Demo, la prueba venció
 * el 9 de septiembre, y la aplicación le dijo:
 *
 *     Esta empresa no tiene módulos activos en este momento.
 *     Prueba finalizada
 *     Tus datos se conservarán. Contacta al equipo de Trazaloop para reactivar
 *     el acceso.
 *
 * Tres frases y tres problemas. No podía entrar a ver su propio trabajo; no
 * podía llegar a facturación, porque Configuración vive dentro del shell y al
 * shell no se entra sin módulo; y para recuperar el acceso tenía que escribir
 * a una persona y esperar.
 *
 *
 * LA CAUSA
 *
 * La regla canónica devolvía UN booleano, `allowed`, y tres preguntas distintas
 * lo consultaban: ¿puedo entrar?, ¿puedo crear?, ¿cómo se pinta la tarjeta?
 * Con un solo interruptor, apagar el permiso de crear apagaba también el de
 * mirar, y una prueba vencida acababa indistinguible de un módulo que la
 * empresa nunca contrató.
 *
 *
 * LA REGLA
 *
 *   permiso vencido → Free → los datos se conservan
 *                          → los módulos ya usados se consultan
 *                          → crear y editar, bloqueado EN SERVIDOR
 *                          → facturación siempre alcanzable
 *
 * Y una frontera que no se cruza: solo conserva consulta quien tuvo el módulo.
 * Free no regala módulos que nunca se contrataron.
 *
 * Correr: npm run test:pl01c4
 */
import { readFileSync } from "node:fs";
import { resolveModuleAccess, type ModuleAccessInput } from "../../lib/modules/access";
import {
  isEnterableState, isReadableState, isReadOnlyState,
  moduleAccessDeniedMessage, DERIVED_STATE_LABEL, DERIVED_STATE_HINT,
  RETAINED_READ_DENIED_MESSAGE, ACTIVATE_FULL_HREF,
  DEMO_EXPIRED_BANNER,
} from "../../lib/modules/messages";
import {
  presentationFor, isNavigable, overviewOf,
  FREE_RETAINED_TITLE, FREE_RETAINED_BODY,
} from "../../lib/modules/entry";

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function check(n: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}
const leer = (f: string) => readFileSync(f, "utf8");
const sinComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\/|(^|[^:])\/\/[^\n]*/g, "$1");

const AHORA = new Date("2026-09-13T00:00:00.000Z");
const ANTES = "2026-09-09T20:29:33.865Z";  // el vencimiento REAL de Producción
const DESPUES = "2026-10-30T00:00:00.000Z";

function acceso(p: Partial<ModuleAccessInput> = {}) {
  return resolveModuleAccess({
    isFunctional: true, killSwitchActive: true, now: AHORA,
    assignment: { enabled: true, accessMode: "demo", accessExpiresAt: ANTES },
    ...p,
  });
}

console.log("\nA · La prueba vencida conserva la consulta");
// ===========================================================================

check("El caso exacto de Producción: no puede crear, sí puede mirar", () => {
  const d = acceso();
  assert(d.derivedState === "demo_expired", `estado «${d.derivedState}»`);
  assert(d.allowed === false, "una prueba vencida no puede volver a crear");
  assert(d.retainedRead === true,
    "la empresa perdió el acceso a su propia información al vencer la prueba");
});

check("Un módulo que la empresa NUNCA tuvo no se regala", () => {
  const d = acceso({ assignment: null });
  assert(d.derivedState === "not_assigned", `estado «${d.derivedState}»`);
  assert(d.allowed === false, "no debería poder crear");
  assert(d.retainedRead === false,
    "sin asignación no hay historia que consultar: Free estaría regalando el módulo");
});

check("Una suspensión administrativa NO es un vencimiento", () => {
  const d = acceso({ assignment: { enabled: false, accessMode: "full", accessExpiresAt: null } });
  assert(d.derivedState === "disabled", `estado «${d.derivedState}»`);
  assert(d.retainedRead === false,
    "una decisión administrativa se saltaría entrando en modo consulta");
});

check("Y si no se pudo comprobar nada, se falla cerrado", () => {
  for (const [nombre, d] of [
    ["lectura fallida", acceso({ assignment: null, assignmentUnavailable: true })],
    ["kill switch", acceso({ killSwitchActive: false })],
    ["módulo futuro", acceso({ isFunctional: false })],
  ] as const) {
    assert(d.retainedRead === false,
      `«${nombre}» concedió consulta sin saber si le corresponde`);
  }
});

check("Lo que ya funcionaba sigue igual: acceso vigente lee Y escribe", () => {
  const casos: [string, ReturnType<typeof acceso>][] = [
    ["full", acceso({ assignment: { enabled: true, accessMode: "full", accessExpiresAt: null } })],
    ["extra", acceso({ assignment: { enabled: true, accessMode: "extra", accessExpiresAt: null } })],
    ["demo permanente", acceso({ assignment: { enabled: true, accessMode: "demo", accessExpiresAt: null } })],
    ["demo en curso", acceso({ assignment: { enabled: true, accessMode: "demo", accessExpiresAt: DESPUES } })],
  ];
  for (const [nombre, d] of casos) {
    assert(d.allowed === true, `«${nombre}» dejó de permitir escribir`);
    assert(d.retainedRead === true, `«${nombre}» dejó de permitir leer`);
  }
});

console.log("\nB · La puerta deja entrar, y lo dice");
// ===========================================================================

check("La tarjeta de una prueba vencida se puede pulsar", () => {
  assert(presentationFor("demo_expired") === "read_only",
    `se presenta como «${presentationFor("demo_expired")}»`);
  assert(isNavigable("demo_expired", "/quality") === true,
    "la tarjeta no lleva a ningún sitio: la información queda dentro sin puerta");
  assert(isReadableState("demo_expired") === true, "no se considera legible");
  assert(isReadOnlyState("demo_expired") === true, "no se considera de solo consulta");
});

check("Pero NO se confunde con un módulo en el que se puede trabajar", () => {
  assert(isEnterableState("demo_expired") === false,
    "«entrable» pasó a incluir el vencimiento: eso da permiso de escritura a quien viene a mirar");
  for (const s of ["not_assigned", "disabled", "coming_soon", "unavailable"] as const) {
    assert(isNavigable(s, "/quality") === false, `«${s}» quedó navegable`);
    assert(isReadableState(s) === false, `«${s}» quedó legible`);
  }
});

check("Y el resumen distingue «no tengo nada» de «tengo historia»", () => {
  const vencida = overviewOf(["demo_expired", "not_assigned", "coming_soon"]);
  assert(vencida.hasEnterable === false, "no debería poder trabajar en ninguno");
  assert(vencida.hasReadable === true, "no reconoce que queda algo que consultar");
  assert(vencida.hasReadOnly === true, "no reconoce el modo consulta");

  const vacia = overviewOf(["not_assigned", "not_assigned", "coming_soon"]);
  assert(vacia.hasReadable === false,
    "una empresa sin historia recibiría el mensaje de «tu información sigue aquí»");
});

console.log("\nC · Nadie tiene que escribir un correo");
// ===========================================================================

const PROHIBIDO = [
  "contacta al equipo", "contacta a trazaloop",
  "centro de soporte", "crear ticket",
];

check("«Prueba finalizada» ya no es la etiqueta: se llama por lo que se puede hacer", () => {
  assert(DERIVED_STATE_LABEL.demo_expired === "Solo consulta",
    `la etiqueta dice «${DERIVED_STATE_LABEL.demo_expired}»`);
});

check("Ningún texto del vencimiento manda a soporte", () => {
  const textos: [string, string][] = [
    ["pista de la tarjeta", DERIVED_STATE_HINT.demo_expired],
    ["aviso de la puerta", DEMO_EXPIRED_BANNER],
    ["error de acción bloqueada", RETAINED_READ_DENIED_MESSAGE],
    ["título en Free", FREE_RETAINED_TITLE],
    ["cuerpo en Free", FREE_RETAINED_BODY],
    ["mensaje canónico", moduleAccessDeniedMessage("Trazaloop Quality", "demo_expired")],
  ];
  for (const [dónde, texto] of textos) {
    const t = texto.toLowerCase();
    for (const frase of PROHIBIDO) {
      assert(!t.includes(frase),
        `el ${dónde} dice «${frase}»: eso convierte un cambio de plan en un trámite con una persona`);
    }
  }
});

check("Y todos dicen que la información se conserva", () => {
  for (const [dónde, texto] of [
    ["pista de la tarjeta", DERIVED_STATE_HINT.demo_expired],
    ["aviso de la puerta", DEMO_EXPIRED_BANNER],
    ["error de acción bloqueada", RETAINED_READ_DENIED_MESSAGE],
    ["cuerpo en Free", FREE_RETAINED_BODY],
  ] as const) {
    assert(/conserv|sigues? consultando|seguir consultando/i.test(texto),
      `el ${dónde} no dice que los datos siguen ahí: «${texto}»`);
  }
});

check("La salida es autoservicio y NO inicia ningún cobro", () => {
  assert(ACTIVATE_FULL_HREF === "/settings/billing",
    `«Activar Full» apunta a «${ACTIVATE_FULL_HREF}»`);
  for (const f of [
    "components/domain/modules/module-entry.tsx",
    "components/domain/modules/demo-trial-banner.tsx",
    "components/domain/modules/read-only-notice.tsx",
    "app/(app)/modules/page.tsx",
  ]) {
    const src = sinComentarios(leer(f));
    assert(!/startOneTimeCheckoutAction|startRenewalCheckoutAction|init_point|initPoint/.test(src),
      `${f} inicia un pago desde la navegación: pulsar «Activar Full» debe abrir una pantalla, no cobrar`);
  }
});

console.log("\nD · El bloqueo es del servidor, no del botón");
// ===========================================================================

const GATE = sinComentarios(leer("server/actions/module-plans.ts"));

check("Solo la puerta de mutación admite el paso en consulta", () => {
  // Las otras cuatro deciden sobre CREAR (límites, funciones, cuota, tamaño
  // por archivo) y tienen que seguir denegando igual que antes.
  // Solo las LLAMADAS. La definición también contiene la palabra —es su
  // parámetro— y contarla daba dos donde hay una.
  const conPermiso = GATE.match(/resolveModuleGate\(moduleCode, \{[^}]*allowRetainedRead/g) ?? [];
  assert(conPermiso.length === 1,
    `${conPermiso.length} llamadas piden paso en consulta; debe ser exactamente una`);
  const i = GATE.indexOf("export async function checkModuleCanMutate");
  const j = GATE.indexOf("allowRetainedRead: true");
  assert(i > -1 && j > i && j < i + 600,
    "la única que pide paso en consulta no es checkModuleCanMutate");
});

check("Y en consulta solo pasan las intenciones que no crean nada", () => {
  const m = /INTENCIONES_PERMITIDAS_EN_CONSULTA: readonly MutationIntent\[\] = \[([\s\S]*?)\]/
    .exec(GATE);
  assert(m !== null, "desapareció la lista de intenciones permitidas");
  const permitidas = [...m![1].matchAll(/"([a-z_]+)"/g)].map((x) => x[1]).sort();
  assert(JSON.stringify(permitidas)
      === JSON.stringify(["delete_or_reduce", "essential_account_operation", "read"]),
    `la lista permite ${JSON.stringify(permitidas)}`);
  // Escrita en positivo: lo que no esté, se bloquea.
  assert(!/business_increase_or_modify|ai_execution/.test(m![1]),
    "crear, editar o ejecutar IA entraron en la lista de lo permitido en consulta");
});

check("Crear, editar y subir siguen pasando por la puerta", () => {
  assert(/if \(gate\.ok\.readOnly && !INTENCIONES_PERMITIDAS_EN_CONSULTA\.includes\(intent\)\)/
    .test(GATE), "el bloqueo por intención desapareció de checkModuleCanMutate");
  assert(GATE.includes("RETAINED_READ_DENIED_MESSAGE"),
    "la denegación no explica qué hace falta ni que los datos se conservan");
});

check("La puerta por omisión sigue cerrada", () => {
  assert(/options: \{ allowRetainedRead\?: boolean \} = \{\}/.test(GATE),
    "el paso en consulta dejó de ser opcional: se concedería sin pedirlo");
  assert(/const soloConsulta =\s*options\.allowRetainedRead === true && !access\.allowed && access\.retainedRead/
    .test(GATE), "el paso en consulta ya no exige que el llamador lo pida");
});

console.log("\nE · Se entra al módulo, y se avisa de que es a mirar");
// ===========================================================================

const GUARDAS: [string, string, string][] = [
  ["Quality", "lib/auth/require-quality-module.ts", "app/(app)/(shell)/quality/layout.tsx"],
  ["PCR", "lib/auth/require-cpr-module.ts", "app/(app)/(shell)/(cpr)/layout.tsx"],
  ["Textiles", "lib/auth/require-textiles-module.ts", "app/(app)/(shell)/textiles/layout.tsx"],
];

check("Las tres guardas dejan entrar por lectura, no por escritura", () => {
  for (const [nombre, guarda] of GUARDAS) {
    const src = sinComentarios(leer(guarda));
    assert(/if \(!access\.retainedRead\)/.test(src),
      `la guarda de ${nombre} sigue cerrando la entrada con «allowed»`);
    assert(/readOnly: !access\.allowed/.test(src),
      `la guarda de ${nombre} no dice si se entra a trabajar o a consultar`);
  }
});

check("Y los tres layouts avisan cuando se entra a consultar", () => {
  for (const [nombre, , layout] of GUARDAS) {
    const src = sinComentarios(leer(layout));
    assert(/ModuleReadOnlyNotice/.test(src),
      `${nombre} deja entrar sin avisar: se rellena un formulario y se pierde al guardar`);
    // Vale el ternario o el retorno temprano: lo que se exige es que el aviso
    // dependa de `readOnly`, no la forma de escribirlo.
    assert(/org\.readOnly \?/.test(src) || /if \(!org\.readOnly\) return/.test(src),
      `${nombre} pinta el aviso sin mirar si corresponde`);
  }
});

check("El aviso dice qué SÍ se puede hacer", () => {
  // Sin comentarios: la cabecera explica justamente qué NO se dice, y leerla
  // como si fuera texto de pantalla es el mismo error que puso en rojo al
  // guardián 54 en PROD-LAUNCH-01B.9.
  const src = sinComentarios(leer("components/domain/modules/read-only-notice.tsx"));
  for (const verbo of ["consultar", "descargar", "borrar"]) {
    assert(new RegExp(verbo, "i").test(src), `el aviso no menciona «${verbo}»`);
  }
  assert(!/no tienes permiso|cuenta bloqueada|suspendid/i.test(src),
    "el aviso culpa a la persona o habla de una cuenta bloqueada, y no es ninguna de las dos cosas");
});

check("Descargas y exportaciones se declaran lectura", () => {
  const sitios = [
    ["app/(app)/(shell)/quality/documents/[documentId]/pdf/route.ts", "requireQualityForAction"],
    ["app/(app)/(shell)/quality/documents/master/csv/route.ts", "requireQualityForAction"],
    ["app/(app)/(shell)/quality/documents/master/pdf/route.ts", "requireQualityForAction"],
    ["server/actions/audit-support.ts", "requireCprForAction"],
    ["server/actions/imports.ts", "requireCprForAction"],
    ["server/actions/trazadocs-master.ts", "requireCprForAction"],
  ] as const;
  for (const [f, guarda] of sitios) {
    const src = sinComentarios(leer(f));
    const total = (src.match(new RegExp(`${guarda}\\(`, "g")) ?? []).length;
    const lectura = (src.match(new RegExp(`${guarda}\\(\\{ intent: "read" \\}\\)`, "g")) ?? []).length;
    assert(total > 0 && total === lectura,
      `${f}: ${lectura} de ${total} llamadas declaran lectura — con la prueba vencida no podría llevarse su información`);
  }
});

check("Pero las acciones que MUTAN no se declararon lectura de rebote", () => {
  const diagnostico = sinComentarios(leer("server/actions/textiles-diagnostic.ts"));
  assert(!/requireTextilesForAction\(\{ intent: "read" \}\)/.test(diagnostico),
    "el diagnóstico de Textiles crea y modifica: no puede pasar como lectura");
  assert(/requireTextilesForAction\(\)/.test(diagnostico),
    "el diagnóstico de Textiles perdió su guarda");
});

console.log("\nF · A facturación se llega sin tener módulos");
// ===========================================================================

check("La puerta —que está FUERA del shell— enlaza a Plan y facturación", () => {
  const src = sinComentarios(leer("app/(app)/modules/page.tsx"));
  const i = src.indexOf('href="/settings/billing"');
  assert(i > -1,
    "01B.9 puso facturación en la barra del shell, y a esta pantalla no llega: "
    + "la empresa sin módulos seguiría sin poder llegar a comprar");
  const linea = src.slice(src.lastIndexOf("\n", i) + 1, src.indexOf("\n", i));
  assert(!/hasEnterable|isEnterable|activeModules/.test(linea),
    `el enlace a facturación depende de tener módulos: «${linea.trim()}»`);
});

check("Y el aviso de Free ofrece la salida", () => {
  const src = sinComentarios(leer("app/(app)/modules/page.tsx"));
  assert(/FREE_RETAINED_TITLE/.test(src) && /FREE_RETAINED_BODY/.test(src),
    "la portada sigue diciendo solo «no tienes módulos activos»");
  assert(/resumen\.hasReadable \?/.test(src),
    "la portada no distingue entre no tener nada y tener historia");
  assert(/ACTIVATE_FULL_HREF/.test(src), "no ofrece cómo volver a Full");
});

check("El destino de cada tarjeta se resuelve por LECTURA", () => {
  const src = sinComentarios(leer("app/(app)/modules/page.tsx"));
  assert(/isEnterable: isReadableState\(state\)/.test(src),
    "la puerta calcula el destino con «entrable»: los módulos con historia se quedan sin enlace");
});

console.log(`\nPROD-LAUNCH-01C.4 · consulta retenida: ${passed} en verde, ${failed} en rojo\n`);
process.exit(failed === 0 ? 0 : 1);
