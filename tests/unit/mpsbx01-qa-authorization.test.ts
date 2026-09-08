import { readFileSync } from "node:fs";

/**
 * Trazaloop · MERCADOPAGO-SBX-01 · La autorización del disparador de QA.
 *
 * POR QUÉ ESTA PRUEBA EXISTE
 *
 * El camino de automatización de las rutas de QA nunca se había ejercitado: en
 * PE-05B2 las llamadas las hizo una persona con su sesión, y el bypass de
 * Vercel se usó como PARÁMETRO DE URL para que los webhooks del proveedor
 * atravesaran la protección de Preview —que es otra cosa—. La primera vez que
 * una máquina intentó usarlo, la respuesta fue `NOT_PLATFORM_SUPERADMIN` sin
 * decir por qué.
 *
 * QUÉ COMPRUEBA, Y QUÉ NO
 *
 * Comprueba la ESTRUCTURA de la autorización sobre el código real: el orden de
 * los candados, que la comparación sea en tiempo constante, que el camino de
 * máquina no pregunte a la base, y que Producción quede fuera pase lo que pase.
 * No comprueba el comportamiento contra un despliegue vivo —eso exige el
 * secreto y una red— y no finge hacerlo.
 */

const RUTAS = [
  "app/api/billing/qa/mercadopago-smoke/route.ts",
  "app/api/billing/qa/wompi-smoke/route.ts",
];

let passed = 0;
let failed = 0;

function check(nombre: string, fn: () => void) {
  try {
    fn();
    passed += 1;
    console.log(`  ✔ ${nombre}`);
  } catch (e) {
    failed += 1;
    console.log(`  ✘ ${nombre}: ${e instanceof Error ? e.message : e}`);
  }
}

function assert(cond: boolean, mensaje: string) {
  if (!cond) throw new Error(mensaje);
}

console.log("\nMERCADOPAGO-SBX-01 · autorización del disparador de QA\n");

for (const ruta of RUTAS) {
  const src = readFileSync(ruta, "utf8");
  const nombre = ruta.split("/").slice(-2)[0];

  console.log(`${nombre}`);

  check("1. Producción queda fuera, y es lo PRIMERO que se mira", () => {
    const iProd = src.indexOf('QA_TRIGGER_FORBIDDEN_IN_PRODUCTION');
    const iAuth = src.indexOf('x-vercel-protection-bypass');
    assert(iProd > 0, "no se encuentra el candado de Producción");
    assert(iAuth > 0, "no se encuentra el camino de automatización");
    assert(iProd < iAuth,
      "el candado de Producción tiene que ir ANTES de cualquier autorización: "
      + "si no, quien conoce el secreto podría alcanzarla en Producción");
  });

  check("2. La comparación de secretos es en tiempo constante", () => {
    assert(src.includes("timingSafeEqual"),
      "la comparación debe usar timingSafeEqual, no ===");
  });

  check("3. Falla cerrado cuando el secreto no está en el despliegue", () => {
    // `if (!presentado || !esperado) return false` — sin secreto configurado,
    // la vía de máquina sencillamente no existe.
    assert(/if \(!presentado \|\| !esperado\) return false;/.test(src),
      "sin secreto esperado la comparación debe devolver false, no true");
  });

  check("4. El secreto presentado nunca se registra ni se devuelve", () => {
    const sospechoso = new RegExp(
      "(console\\.log|NextResponse\\.json)[^\\n]*"
      + "(VERCEL_AUTOMATION_BYPASS_SECRET|x-vercel-protection-bypass\"\\))");
    assert(!sospechoso.test(src), "el secreto no puede salir en un registro ni en una respuesta");
  });
}

console.log("\nsolo mercadopago-smoke");
const mp = readFileSync(RUTAS[0], "utf8");

check("5. El camino de máquina NO consulta platform_staff", () => {
  const iAuto = mp.indexOf("const porAutomatizacion");
  const iCheck = mp.indexOf("checkPlatformStatus()");
  assert(iAuto > 0 && iCheck > 0, "no se encuentran las dos piezas");
  assert(iAuto < iCheck,
    "el secreto debe comprobarse ANTES de preguntar a la base: para esa "
    + "identidad la consulta no decide nada y es una forma más de fallar");
  assert(/if \(!porAutomatizacion\) \{\s*\(\{ isStaff, isSuperadmin \} = await checkPlatformStatus\(\)\);/.test(mp),
    "checkPlatformStatus solo debe llamarse cuando NO hay secreto");
});

check("6. `preflight` no crea el cliente administrativo", () => {
  const iPreflight = mp.indexOf('if (accion === "preflight")');
  const iAdmin = mp.indexOf("const admin = createAdminClient()");
  assert(iPreflight > 0 && iAdmin > 0, "no se encuentran las dos piezas");
  assert(iPreflight < iAdmin,
    "preflight tiene que responder antes de que exista un cliente de base: "
    + "un diagnóstico que necesita la base no sirve para diagnosticar la base");
});

check("7. La sonda del pagador es autocontenida", () => {
  const iSonda = mp.indexOf('if (accion === "probe_payer_email")');
  const iAdmin = mp.indexOf("const admin = createAdminClient()");
  assert(iSonda > 0 && iSonda < iAdmin,
    "la sonda debe ir antes del cliente administrativo");
  const bloque = mp.slice(iSonda, iAdmin);
  for (const prohibido of ["billing_checkout_intents", "admin.from(", "admin.rpc("]) {
    assert(!bloque.includes(prohibido),
      `la sonda no puede depender de ${prohibido}: es una pregunta al proveedor`);
  }
});

check("8. El diagnóstico de autorización no devuelve el secreto", () => {
  const i = mp.indexOf('=== "authprobe"');
  assert(i > 0, "no se encuentra el diagnóstico");
  const bloque = mp.slice(i, i + 2500);
  assert(bloque.includes("bypass_header_present") && bloque.includes("matches_header"),
    "el diagnóstico debe decir si la cabecera llega y si coincide");
  // Solo booleanos y nombres: ninguna interpolación del valor.
  assert(!/\$\{[^}]*(esperado|cab|qs)[^}]*\}/.test(bloque),
    "el diagnóstico no puede interpolar el secreto ni la cabecera en su salida");
  assert(!/(esperado|cab|qs)\.(slice|substring|length)/.test(bloque),
    "ni longitudes, ni prefijos: eso también es información del secreto");
});

check("9. Cualquier excepción sale como JSON, no como 500 mudo", () => {
  assert(mp.includes("QA_TRIGGER_UNHANDLED_EXCEPTION"),
    "el manejador debe envolverse y contestar JSON");
  assert(!/stack/i.test(mp.split("QA_TRIGGER_UNHANDLED_EXCEPTION")[1]?.slice(0, 400) ?? ""),
    "la pila no se devuelve: puede llevar rutas y valores");
});

check("10. La ruta sigue declarada como temporal", () => {
  assert(mp.includes("QA_TRIGGER_IS_TEMPORARY"),
    "la marca de temporal no puede desaparecer");
});

console.log(`\nMERCADOPAGO-SBX-01 · autorización: ${passed} en verde, ${failed} en rojo\n`);
process.exit(failed === 0 ? 0 : 1);
