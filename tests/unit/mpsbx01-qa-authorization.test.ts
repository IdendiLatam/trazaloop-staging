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

/**
 * El trozo de código que pertenece a UNA acción, y solo a ella.
 *
 * Acotar por un hito lejano —el cliente administrativo, o un número de
 * caracteres— parecía cómodo y ya ha dado dos rojos falsos: al insertar una
 * acción nueva delante, las pruebas de las viejas empezaron a leer código
 * ajeno. Un bloque termina donde empieza la siguiente acción.
 */
function bloqueDe(accion: string): string {
  const ini = mp.indexOf(`accion === "${accion}"`);
  if (ini < 0) throw new Error(`no se encuentra la acción ${accion}`);
  const sig = mp.indexOf('if (accion === "', ini + 10);
  return mp.slice(ini, sig > ini ? sig : mp.length);
}

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
  const bloque = bloqueDe("probe_payer_email");
  for (const prohibido of ["billing_checkout_intents", "admin.from(", "admin.rpc("]) {
    assert(!bloque.includes(prohibido),
      `la sonda no puede depender de ${prohibido}: es una pregunta al proveedor`);
  }
});

check("7 bis. La sonda anual también es autocontenida", () => {
  const iSonda = mp.indexOf('if (accion === "probe_annual")');
  const iAdmin = mp.indexOf("const admin = createAdminClient()");
  assert(iSonda > 0 && iSonda < iAdmin, "la sonda anual debe ir antes del cliente administrativo");
  const bloque = bloqueDe("probe_annual");
  for (const prohibido of ["billing_checkout_intents", "admin.from(", "admin.rpc("]) {
    assert(!bloque.includes(prohibido), `la sonda anual no puede depender de ${prohibido}`);
  }
  // La recurrencia es constante del experimento, no un parámetro de quien llama.
  assert(!/frequency:\s*Number\(|cuerpo\.frequency/.test(bloque),
    "la recurrencia no puede llegar de quien llama: es una constante del experimento");
  assert(/frequency: 12, frequency_type: "months"/.test(bloque),
    "la sonda debe pedir exactamente 12 months");
  // Y el veredicto se calcula sobre lo DEVUELTO, no sobre lo enviado.
  assert(/ar\.frequency === 12 && ar\.frequency_type === "months"/.test(bloque),
    "el veredicto debe leer el auto_recurring devuelto, no el enviado");
});

check("7 ter. Las sondas de 01C no dependen de la base ni del dinero de quien llama", () => {
  const iCasos = mp.indexOf("const CASOS_01C");
  const iAdmin = mp.indexOf("const admin = createAdminClient()");
  assert(iCasos > 0 && iCasos < iAdmin, "01C debe ir antes del cliente administrativo");
  const bloque = mp.slice(iCasos, iAdmin);
  for (const prohibido of ["billing_checkout_intents", "admin.from(", "admin.rpc("]) {
    assert(!bloque.includes(prohibido), `01C no puede depender de ${prohibido}`);
  }
  // Los importes son constantes del experimento: quien llama elige el CASO.
  assert(/up:\s*\{ inicial: 5000, destino: 9000 \}/.test(bloque)
      && /down:\s*\{ inicial: 9000, destino: 5000 \}/.test(bloque),
    "los importes de cada caso deben estar fijados en el código");
  assert(!/transaction_amount:\s*Number\(cuerpo|cuerpo\.amount/.test(bloque),
    "el importe no puede llegar de quien llama");
  // Subir y bajar se prueban en suscripciones distintas.
  assert(/CASE_MUST_BE_UP_OR_DOWN/.test(bloque),
    "el caso debe ser una lista cerrada de dos valores");
  // La foto de ANTES la toma la misma acción que hace el PUT.
  const iCambio = mp.indexOf('accion === "probe_amount_change"');
  const bloqueCambio = mp.slice(iCambio, iAdmin);
  assert(bloqueCambio.indexOf("const antes = estadoDe(j0)") < bloqueCambio.indexOf('method: "PUT"'),
    "el estado previo se captura antes del PUT, en la misma llamada");
  assert(/antes\.status !== "authorized"/.test(bloqueCambio),
    "cambiar el importe de una suscripción no autorizada no responde la pregunta");
  // Y el después se relee del proveedor, no del eco del PUT.
  assert(bloqueCambio.includes("no del eco del PUT") || /const despues = estadoDe\(j2\)/.test(bloqueCambio),
    "el estado posterior debe releerse, no tomarse de la respuesta del PUT");
});

check("7 quater. El PUT lleva el `reason` real y NUNCA preapproval_plan_id", () => {
  const bloque = bloqueDe("probe_amount_change");
  // El 400 decía «Invalid value for preapproval_plan_id» sin que se enviara.
  // Que siga sin enviarse es exactamente lo que hay que fijar.
  assert(!/preapproval_plan_id:\s/.test(bloque),
    "el body del PUT no puede llevar preapproval_plan_id, ni siquiera como null");
  // `reason` se toma de la suscripción leída, no de una constante ni del cuerpo.
  assert(/reason: antes\.reason/.test(bloque),
    "el reason debe ser el de la suscripción, leído del proveedor: inventarlo la renombraría");
  assert(!/reason:\s*["`]/.test(bloque), "el reason no puede ser un literal");
  assert(!/cuerpo\.reason/.test(bloque), "el reason no puede llegar de quien llama");
  // Y nada más viaja en el body.
  // Sin la bandera `s`: se busca el bloque hasta el cierre de la llave, y se
  // hace con índices en vez de con una expresión que el objetivo no admite.
  const iIni = bloque.indexOf("const cuerpoPut");
  const iFin = bloque.indexOf("};", iIni);
  const m = iIni >= 0 && iFin > iIni ? [bloque.slice(iIni, iFin + 2)] : null;
  assert(Boolean(m), "no se encuentra la construcción del body");
  for (const prohibido of ["status", "card_token_id", "external_reference", "back_url"]) {
    assert(!new RegExp(`\\b${prohibido}:`).test(m![0]),
      `el body mínimo no debe incluir ${prohibido}`);
  }
});

check("7 quinquies. La cancelación mínima manda DOS claves y ninguna más", () => {
  const i = mp.indexOf('accion === "cancel_min"');
  const iAdmin = mp.indexOf("const admin = createAdminClient()");
  assert(i > 0 && i < iAdmin, "cancel_min debe ir antes del cliente administrativo");
  const bloque = bloqueDe("cancel_min");
  const iIni = bloque.indexOf("const cuerpoPut");
  const iFin = bloque.indexOf("};", iIni);
  assert(iIni >= 0 && iFin > iIni, "no se encuentra la construcción del body");
  const body = bloque.slice(iIni, iFin + 2);
  // Exactamente `reason` y `status`.
  assert(/reason: antes\.reason/.test(body),
    "el reason debe ser el leído del proveedor, no un literal ni algo de quien llama");
  assert(/status: grafia/.test(body), "el status debe salir de la grafía elegida");
  for (const prohibido of ["preapproval_plan_id", "auto_recurring", "external_reference",
                           "card_token_id", "back_url"]) {
    assert(!body.includes(prohibido), `el body mínimo no puede llevar ${prohibido}`);
  }
  const claves = (body.match(/^\s+[a-z_]+:/gm) ?? []).length;
  assert(claves === 2, `el body debe tener exactamente 2 claves y tiene ${claves}`);
  // La grafía es una lista cerrada de dos valores, no texto libre.
  assert(/cuerpo\.status_spelling === "cancelled" \? "cancelled" : "canceled"/.test(bloque),
    "la grafía debe ser una elección entre las dos documentadas");
  // Y el veredicto no da nada por hecho sin 2xx.
  assert(/cancelada: aceptado/.test(bloque),
    "sin PUT aceptado no se puede declarar cancelada");
});

check("7 sexies. `qa_version` no llama al proveedor ni devuelve secretos", () => {
  const i = mp.indexOf('accion === "qa_version"');
  assert(i > 0, "no se encuentra qa_version");
  // El bloque termina donde empieza `preflight`. Recortar por un número de
  // caracteres dejaba dentro código ajeno, y la prueba fallaba por lo que hacía
  // el vecino: exactamente el tipo de falso rojo que enseña a ignorar pruebas.
  const iFin = mp.indexOf('if (accion === "preflight")', i);
  assert(iFin > i, "no se encuentra el final del bloque");
  const bloque = mp.slice(i, iFin);
  assert(!bloque.includes("api.mercadopago.com"), "no puede llamar al proveedor");
  assert(!bloque.includes("MERCADOPAGO_ACCESS_TOKEN"), "no puede tocar el token");
  assert(!bloque.includes("admin.") && !bloque.includes("createAdminClient"),
    "no puede tocar la base");
  assert(!/VERCEL_AUTOMATION_BYPASS_SECRET/.test(bloque), "no puede devolver el secreto");
  // La lista de acciones se DERIVA del catálogo: escrita a mano envejecería
  // justo cuando más falta hace, que es al añadir una acción nueva.
  assert(/acciones_disponibles: \[\.\.\.ACCIONES\]/.test(bloque),
    "las acciones deben derivarse del catálogo, no escribirse");
  assert(/cancel_min_available: \(ACCIONES as readonly string\[\]\)\.includes\("cancel_min"\)/.test(bloque),
    "la disponibilidad debe derivarse del catálogo");
  // Y va antes de los candados del proveedor: sirve para diagnosticar aunque
  // el token falte.
  const iToken = mp.indexOf("if (!tokenPuesto) return no(");
  assert(i < iToken, "qa_version debe responder aunque no haya credencial de proveedor");
});

check("7 septies. `cancel_raw` no usa el SDK y manda exactamente reason + status", () => {
  const i = mp.indexOf('accion === "cancel_raw"');
  const iAdmin = mp.indexOf("const admin = createAdminClient()");
  assert(i > 0 && i < iAdmin, "cancel_raw debe ir antes del cliente administrativo");
  const bloque = bloqueDe("cancel_raw");

  // Ni una clase del SDK en el camino del PUT. Ese es todo el objetivo.
  for (const delSdk of ["PreApproval", "new PreApproval", "MercadoPagoConfig",
                        "proveedor.cancelSubscription", "proveedor."]) {
    assert(!bloque.includes(delSdk), `cancel_raw no puede usar ${delSdk}`);
  }
  assert(/await fetch\(url, \{\s*\n?\s*method: "PUT"/.test(bloque)
      || /method: "PUT", headers: cab, body: JSON\.stringify\(cuerpoPut\)/.test(bloque),
    "el PUT tiene que ser fetch nativo");
  assert(/request_transport: "native_fetch"/.test(bloque)
      && /sdk_used_for_put: false/.test(bloque),
    "la respuesta debe declarar el transporte");

  // El body: exactamente dos claves.
  const iIni = bloque.indexOf("const cuerpoPut");
  const iFin = bloque.indexOf("};", iIni);
  const body = bloque.slice(iIni, iFin >= 0 ? iFin + 2 : bloque.indexOf(";", iIni) + 1);
  assert(/reason: antes\.reason/.test(body), "el reason debe ser el leído del proveedor");
  assert(/status: grafia/.test(body), "el status sale de la grafía elegida");
  for (const prohibido of ["preapproval_plan_id", "auto_recurring", "external_reference",
                           "card_token_id", "back_url"]) {
    assert(!body.includes(prohibido), `el body no puede llevar ${prohibido}`);
  }
  // Y `canceled` es el valor por omisión, como pide el encargo.
  assert(/cuerpo\.status_spelling === "cancelled" \? "cancelled" : "canceled"/.test(bloque),
    "por omisión debe enviarse «canceled»");

  // El token no puede salir por ninguna vía.
  assert(!/Authorization[^\n]*(NextResponse|log_seguro)/.test(bloque),
    "la cabecera de autorización no se devuelve ni se registra");
  // El invariante NO es cuántas veces aparece el token —contar mide el código
  // vecino, y ya dio un rojo falso— sino que CADA aparición esté armando la
  // cabecera de autorización y ninguna otra cosa.
  const lineasToken = bloque.split("\n").filter((l) => l.includes("MERCADOPAGO_ACCESS_TOKEN"));
  assert(lineasToken.length > 0, "el token tiene que usarse para autenticar");
  for (const l of lineasToken) {
    assert(l.includes("Authorization"),
      `el token solo puede armar la cabecera, y aparece en: ${l.trim().slice(0, 60)}`);
  }
});

check("7 octies. MP-PLAN-01 · cifras constantes, sin SDK y sin base", () => {
  const i = mp.indexOf("const PLAN01 = {");
  const iAdmin = mp.indexOf("const admin = createAdminClient()");
  assert(i > 0 && i < iAdmin, "MP-PLAN-01 debe ir antes del cliente administrativo");
  const bloque = mp.slice(i, iAdmin);

  for (const prohibido of ["billing_checkout_intents", "admin.from(", "admin.rpc(",
                           "PreApproval", "proveedor."]) {
    assert(!bloque.includes(prohibido), `MP-PLAN-01 no puede usar ${prohibido}`);
  }
  assert(/amount: 5000/.test(bloque) && /currency: "COP"/.test(bloque)
      && /frequency: 1/.test(bloque) && /frequency_type: "months"/.test(bloque),
    "las cifras del plan deben estar fijadas en el código");
  assert(!/transaction_amount:\s*Number\(cuerpo|cuerpo\.amount/.test(bloque),
    "el importe no puede llegar de quien llama");
  for (const l of bloque.split("\n").filter((x) => x.includes("MERCADOPAGO_ACCESS_TOKEN"))) {
    assert(l.includes("Authorization"),
      `el token solo puede armar la cabecera, y aparece en: ${l.trim().slice(0, 60)}`);
  }
});

check("7 nonies. El camino por API sin testigo de tarjeta NO existe", () => {
  // La documentación exige `card_token_id` y `status: authorized` para una
  // suscripción con plan creada por API. Probarlo sin tarjeta no demostraría
  // nada sobre la viabilidad del plan, así que la acción se retiró del
  // catálogo en vez de dejarla apagada: un camino que no debe usarse y sigue
  // ahí es una trampa esperando a la próxima prisa.
  // Se mira el CATÁLOGO, no el fichero entero: `qa_version` nombra la acción a
  // propósito, para declarar en voz alta que NO está disponible.
  const iCat = mp.indexOf("const ACCIONES = [");
  const catalogo = mp.slice(iCat, mp.indexOf("] as const;", iCat));
  assert(!catalogo.includes("plan_subscribe"),
    "plan_subscribe no puede estar en el catálogo de acciones");
  assert(!mp.includes('accion === "plan_subscribe"'),
    "tampoco puede quedar su implementación");
  assert(/plan_subscribe_api_available/.test(mp),
    "y qa_version debe decir explícitamente que no está disponible");
  // Se busca la CLAVE, no la palabra. Las dos apariciones que hay son
  // comentarios que explican que NO se envía, y una guarda que se dispara con
  // la prosa que la defiende es peor que no tenerla: enseña a ignorarla.
  const sinComentarios = mp
    .split("\n")
    .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
    .join("\n");
  assert(!/card_token_id\s*:/.test(sinComentarios),
    "no se manda ningún testigo de tarjeta: esta fase no lo usa");
});

check("7 decies. El descubrimiento NO supone el identificador", () => {
  const bloque = bloqueDe("probe_plan_state");
  assert(/preapproval\/search/.test(bloque),
    "la suscripción se busca en el proveedor, no se adivina");
  assert(/preapproval_plan_id=\$\{encodeURIComponent\(planId\)\}/.test(bloque),
    "se busca POR el plan, que es exclusivo del experimento");
  assert(/MAS_DE_UNA_SUSCRIPCION_PARA_UN_PLAN_EXCLUSIVO/.test(bloque),
    "con más de una candidata hay que parar: elegir sería sortear la evidencia");
  assert(/SIN_SUSCRIPCIONES_PARA_ESE_PLAN/.test(bloque),
    "sin candidatas se dice, no se inventa");
  assert(/plan_coincide/.test(bloque),
    "el criterio obligatorio es que la suscripción sea de ESE plan");
  assert(/primer_pago_es_5000_cop/.test(bloque),
    "el primer cobro se comprueba en importe y moneda, no solo en existencia");
});

check("7 undecies. La cancelación con plan manda UNA sola clave", () => {
  const bloque = bloqueDe("plan_cancel_raw");
  const iIni = bloque.indexOf("const cuerpoPut");
  const body = bloque.slice(iIni, bloque.indexOf(";", iIni) + 1);
  assert(/status: "canceled"/.test(body), "el estado debe ser exactamente «canceled»");
  for (const prohibido of ["reason", "preapproval_plan_id", "auto_recurring",
                           "external_reference", "card_token_id", "back_url"]) {
    assert(!body.includes(prohibido), `el body no puede llevar ${prohibido}`);
  }
  // Se cuentan las claves DENTRO de las llaves. Contar sobre la línea entera
  // hacía que `cuerpoPut:` aportara una falsa clave: la prueba medía la
  // declaración de la variable, no el objeto.
  const dentro = body.slice(body.indexOf("{") + 1, body.lastIndexOf("}"));
  const claves = (dentro.match(/[A-Za-z_]+\s*:/g) ?? []).length;
  assert(claves === 1, `el body debe tener exactamente 1 clave y tiene ${claves}`);
  assert(/sdk_used_for_put: false/.test(bloque), "debe declarar que no usa el SDK");
  assert(/provider_request_id/.test(bloque), "debe capturar la trazabilidad del proveedor");
});

check("7 duodecies. `qa_version` no promete una procedencia que no tiene", () => {
  const i = mp.indexOf('accion === "qa_version"');
  const iFin = mp.indexOf('if (accion === "preflight")', i);
  const bloque = mp.slice(i, iFin);
  // El campo no puede llamarse `git_commit_sha` a secas: un despliegue por CLI
  // captura el HEAD del momento, que no es el commit del código subido si se
  // desplegó antes de confirmar. El nombre tiene que decir lo que es.
  // `git_commit_sha` puede existir, pero SOLO como «unavailable»: mientras un
  // despliegue por CLI no pueda demostrar que el HEAD capturado es el del
  // código subido, prometerlo sería inventar procedencia.
  assert(/git_commit_sha: "unavailable"/.test(bloque),
    "git_commit_sha solo puede declararse no disponible");
  assert(!/git_commit_sha: process\.env/.test(bloque),
    "no se puede servir la variable de entorno bajo ese nombre");
  assert(/vercel_git_head_at_deploy:/.test(bloque),
    "el dato crudo se nombra por lo que es: el HEAD que vio Vercel");
  assert(/source_revision_marker:/.test(bloque),
    "la autoridad para identificar el DESPLIEGUE es el marcador de revisión");
  assert(/build_marker: QA_DISENO/.test(bloque),
    "y el DISEÑO se identifica aparte: dos despliegues del mismo diseño deben "
    + "poder distinguirse");
  assert(/provenance_note:/.test(bloque),
    "y la salvedad tiene que viajar con el dato, no vivir en una conversación");
  assert(/\?\? "unavailable"/.test(bloque),
    "sin metadatos se dice «unavailable», no null silencioso");
  // Diseño y revisión no pueden ser la misma constante.
  const iD = mp.indexOf("const QA_DISENO");
  const iM = mp.indexOf("const QA_MARCADOR");
  assert(iD > 0 && iM > 0, "deben existir las dos constantes");
  const valD = mp.slice(iD, mp.indexOf(";", iD));
  const valM = mp.slice(iM, mp.indexOf(";", iM));
  assert(valD.split("=")[1].trim() !== valM.split("=")[1].trim(),
    "el diseño y la revisión del despliegue no pueden compartir valor");
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
