/**
 * Trazaloop · PE-05B2W4 · La frontera de la tarjeta.
 *
 * POR QUÉ ESTA SUITE
 *
 * Todo el diseño del pago con tarjeta se apoya en UNA frase: el número, el
 * código de seguridad y la caducidad viajan del navegador a Wompi, y Trazaloop
 * no los ve. Si algún día alguien añade —con la mejor intención— un campo de
 * tarjeta a una acción de servidor «para validarlo antes», esa frase deja de
 * ser cierta y nadie se entera.
 *
 * Así que no se comprueba una lista escrita a mano: se recorre el código de
 * PRODUCTO que corre en el SERVIDOR y se exige que no aparezca ni un campo de
 * tarjeta. El único sitio donde pueden aparecer es el formulario del
 * navegador, y ahí se comprueba además a dónde van.
 *
 * Y no es una búsqueda ingenua: `number` a secas está por todas partes y no
 * significa nada. Lo que se persigue son nombres que SOLO existen para
 * describir una tarjeta.
 *
 * Correr: npm run test:pe05b2w4-boundary
 */
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function check(n: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}

const leer = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");
const sinComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

function ficheros(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const n of readdirSync(dir)) {
    const r = join(dir, n);
    if (statSync(r).isDirectory()) { ficheros(r, out); continue; }
    if (/\.(ts|tsx)$/.test(r)) out.push(r);
  }
  return out;
}

/**
 * EL ÚNICO fichero al que se le permite nombrar una tarjeta: el formulario del
 * navegador, que es exactamente la frontera. Si esta lista crece, la frase de
 * arriba ya no es cierta y hay que discutirlo, no ampliarla en silencio.
 */
const FRONTERA = "components/domain/billing/wompi-card-form.tsx";

/**
 * Nombres que solo existen para describir una tarjeta. `number` a secas queda
 * fuera a propósito: aparece en mil sitios legítimos y convertiría esta prueba
 * en ruido. Se persigue `card_number`, no `number`.
 */
const CAMPOS_DE_TARJETA = [
  "card_number", "cardNumber", "cardnumber",
  "cvc", "cvv", "security_code", "securityCode",
  "exp_month", "exp_year", "expMonth", "expYear", "expiry", "expiration_date",
  "card_holder", "cardHolder",
];

/**
 * Una lista que PROHÍBE un campo no es un uso de ese campo: es lo contrario.
 * `envelopeIsClean` tiene que poder NOMBRAR lo que rechaza. Se quitan solo los
 * arreglos de textos asignados a una constante cuyo nombre dice que deniega
 * —y nada más—, para que la exención no sirva de escondite.
 */
const sinDenegaciones = (s: string) =>
  s.replace(/const\s+[A-Z_]*(?:PROHIBID|FORBIDDEN|DENY|VETAD)[A-Z_]*\s*=\s*\[[^\]]*\]/g, "");

const SERVIDOR = [...ficheros("app/api"), ...ficheros("server"), ...ficheros("lib")];

console.log("\nPE-05B2W4 · La frontera de la tarjeta\n");

// ===========================================================================
console.log("A · Ningún campo de tarjeta en código de servidor");
// ===========================================================================

check("A1. Ni en rutas de API, ni en acciones de servidor, ni en `lib`", () => {
  const culpables: string[] = [];
  for (const f of SERVIDOR) {
    const codigo = sinDenegaciones(sinComentarios(leer(f)));
    for (const campo of CAMPOS_DE_TARJETA) {
      // Se busca el nombre como IDENTIFICADOR —clave de objeto, propiedad,
      // variable— y no dentro de otra palabra.
      if (new RegExp(`\\b${campo}\\b`).test(codigo)) {
        culpables.push(`${f} → ${campo}`);
      }
    }
  }
  assert(culpables.length === 0,
    `hay campos de tarjeta en el servidor: ${culpables.join(", ")}`);
});

check("A2. Y ninguna migración crea una columna con nombre de tarjeta", () => {
  const culpables: string[] = [];
  for (const f of readdirSync("supabase/migrations").filter((x) => x.endsWith(".sql"))) {
    const sql = leer(join("supabase/migrations", f))
      .replace(/^\s*--.*$/gm, "");
    for (const campo of CAMPOS_DE_TARJETA) {
      if (new RegExp(`^\\s+${campo}\\s`, "mi").test(sql)) culpables.push(`${f} → ${campo}`);
    }
  }
  assert(culpables.length === 0, `columnas de tarjeta: ${culpables.join(", ")}`);
});

check("A3. La tokenización desde el servidor ya no existe", () => {
  const qa = leer("app/api/billing/qa/wompi-smoke/route.ts");
  assert(qa.length > 0, "desapareció el disparador de pruebas");
  assert(!/tokenize_test_card/.test(sinComentarios(qa)),
    "el camino de tokenización en el servidor volvió");
  const culpables = SERVIDOR.filter((f) => /\/tokens\/cards/.test(sinComentarios(leer(f))));
  assert(culpables.length === 0,
    `alguien tokeniza desde el servidor: ${culpables.join(", ")}`);
});

// ===========================================================================
console.log("\nB · Y en la frontera, a dónde van");
// ===========================================================================

const FORM = leer(FRONTERA);
const FORM_LIMPIO = sinComentarios(FORM);

check("B1. El formulario del navegador existe y es del navegador", () => {
  assert(FORM.length > 0, "no existe el formulario de tarjeta");
  assert(/^"use client"/m.test(FORM), "el formulario no es un componente de cliente");
});

check("B2. La tarjeta va a Wompi, no a Trazaloop", () => {
  // La ÚNICA petición que lleva los campos es la de tokenización, y su destino
  // sale de la configuración que bajó el servidor.
  assert(/fetch\(`\$\{config\.apiBaseUrl\}\/tokens\/cards`/.test(FORM_LIMPIO),
    "la tokenización no va contra la API del proveedor");
  assert(/Bearer \$\{config\.publicKey\}/.test(FORM_LIMPIO),
    "la tokenización no usa la llave pública");

  // Y lo que sube a nuestro servidor es el testigo. Ni un campo más.
  const i = FORM_LIMPIO.indexOf("submitCardTokenAction({");
  assert(i > 0, "el formulario no llama a la acción de envío");
  const llamada = FORM_LIMPIO.slice(i, FORM_LIMPIO.indexOf("})", i));
  for (const prohibido of ["numero", "cvc", "mes", "anio", "titular"]) {
    assert(!new RegExp(`\\b${prohibido}\\b`).test(llamada),
      `la llamada al servidor lleva «${prohibido}»`);
  }
});

check("B3. No hay un `action` de servidor que se lleve los campos al pulsar Intro", () => {
  assert(!/<form[^>]*\saction=/.test(FORM),
    "el formulario tiene `action`: los campos viajarían al servidor solos");
});

check("B4. Los campos se borran en cuanto el testigo existe", () => {
  assert(/setNumero\(""\)/.test(FORM_LIMPIO) && /setCvc\(""\)/.test(FORM_LIMPIO),
    "los datos de la tarjeta se quedan en memoria después de tokenizar");
});

check("B5. Nada de la tarjeta se escribe en la consola ni se mide", () => {
  assert(!/console\.(log|info|warn|error|debug)/.test(FORM_LIMPIO),
    "el formulario escribe en la consola del navegador");
  assert(!/localStorage|sessionStorage|indexedDB/.test(FORM_LIMPIO),
    "el formulario guarda algo en el navegador");
});

check("B6. Los dos documentos se aceptan a mano · ninguno viene marcado", () => {
  assert(/useState\(false\)/.test(FORM_LIMPIO), "no hay aceptación explícita");
  assert(/defaultChecked/.test(FORM_LIMPIO) === false,
    "algún documento viene aceptado de antemano");
  assert(/aceptaServicio && aceptaDatos/.test(FORM_LIMPIO),
    "se puede pagar sin aceptar los dos documentos");
});

check("B7. Pulsar dos veces no manda dos cobros", () => {
  assert(/enMarcha\.current/.test(FORM_LIMPIO), "no hay cierre contra la doble pulsación");
  assert(/disabled=\{!listo \|\| trabajando\}/.test(FORM_LIMPIO),
    "el botón sigue vivo mientras se cobra");
});

// ===========================================================================
console.log("\nC · Lo que baja al navegador");
// ===========================================================================

check("C1. Solo la llave PÚBLICA · nunca la privada, ni los secretos", () => {
  const config = leer("lib/db/billing-checkout.ts");
  const tipo = config.slice(config.indexOf("export type WompiPublicConfig"),
                            config.indexOf("export type CheckoutConfigResult"));
  for (const prohibido of ["privateKey", "eventsSecret", "integritySecret"]) {
    assert(!tipo.includes(prohibido), `la configuración pública lleva «${prohibido}»`);
  }
  assert(/publicKey: string/.test(tipo), "no baja la llave pública");
});

check("C2. Y ninguna variable `NEXT_PUBLIC_` de Wompi", () => {
  const culpables: string[] = [];
  for (const f of [...SERVIDOR, ...ficheros("components"), ...ficheros("app")]) {
    const m = leer(f).match(/NEXT_PUBLIC_[A-Z_]*WOMPI[A-Z_]*/g);
    if (m) culpables.push(`${f} → ${m.join(",")}`);
  }
  assert(culpables.length === 0, `llaves de Wompi en el paquete del cliente: ${culpables.join(", ")}`);
});

// ===========================================================================
console.log("\nD · El resultado del navegador no es el derecho");
// ===========================================================================

check("D1. La acción de envío devuelve que SALIÓ, no que se cobró", () => {
  const acc = sinComentarios(leer("server/actions/billing.ts"));
  assert(/submitted: true/.test(acc), "la acción no distingue enviado de cobrado");
  for (const prohibido of ["commercial_apply_assignment", "organization_plan_assignments",
                           "billing_settle_payment"]) {
    assert(!acc.includes(prohibido),
      `la acción de pago concede el derecho por su cuenta: ${prohibido}`);
  }
});

check("D2. Y la pantalla espera al LIBRO, no al proveedor", () => {
  assert(/readCheckoutStatusAction\(intentId\)/.test(FORM_LIMPIO),
    "la pantalla no pregunta por el estado canónico");
  const lib = sinComentarios(leer("lib/db/billing-checkout.ts"));
  const i = lib.lastIndexOf("settled:");
  assert(i > 0 && /i\.status === "settled"/.test(lib.slice(i, i + 220)),
    "«liquidado» no sale del libro");
  assert(/suscripcion\?\.status === "active"/.test(lib.slice(i, i + 220)),
    "«liquidado» no exige que la suscripción esté activa");
});

check("D3. El importe no llega del navegador", () => {
  const lib = sinComentarios(leer("lib/db/billing-checkout.ts"));
  const i = lib.indexOf("export async function submitCardToken");
  const firma = lib.slice(i, lib.indexOf("}): Promise<SubmitResult>", i));
  for (const prohibido of ["amount", "total", "currency", "price"]) {
    assert(!new RegExp(`\\b${prohibido}`, "i").test(firma),
      `el envío acepta «${prohibido}» desde fuera`);
  }
  assert(/expected_total_amount/.test(lib), "el importe no sale del intento congelado");
});

check("D4. Recargar no vuelve a pedir la tarjeta ni abre otro cobro", () => {
  const pagina = sinComentarios(leer("app/(app)/(shell)/settings/billing/checkout/page.tsx"));
  const i = pagina.indexOf("findLiveCheckout");
  assert(i > 0, "la pantalla no busca si ya hay una contratación viva");
  const j = pagina.indexOf("createBillingQuote(org.organizationId");
  assert(j > i, "el presupuesto se abre ANTES de mirar si ya había uno");
  assert(/alreadySubmitted/.test(pagina) && /CheckoutWatcher/.test(pagina),
    "un intento ya enviado vuelve a enseñar el formulario de tarjeta");
  // Y un intento abierto SIN enviar se reutiliza con su importe congelado: si
  // no, cada recarga abriría un segundo camino de pago para lo mismo.
  const k = pagina.indexOf("if (viva) {");
  assert(k > 0 && k < j, "un intento abierto no se reutiliza: se presupuesta otra vez");
  assert(/viva\.totalAmount/.test(pagina),
    "se reutiliza el intento pero no el importe que congeló");
  const vigilante = leer("components/domain/billing/checkout-watcher.tsx");
  for (const campo of CAMPOS_DE_TARJETA) {
    assert(!new RegExp(`\\b${campo}\\b`).test(vigilante),
      `la pantalla de espera pide «${campo}»`);
  }
  assert(!/submitCardTokenAction/.test(vigilante), "la pantalla de espera puede cobrar");
});

console.log(`\nPE-05B2W4 · frontera: ${passed} en verde, ${failed} en rojo\n`);
process.exit(failed === 0 ? 0 : 1);
