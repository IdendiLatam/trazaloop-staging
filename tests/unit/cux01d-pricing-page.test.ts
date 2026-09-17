/**
 * Trazaloop · COMMERCIAL-UX-01D · La página de precios.
 *
 *
 * QUÉ DEFIENDE ESTA SUITE
 *
 * Una página de precios se degrada de tres maneras, y ninguna se nota mirando:
 *
 *   1 · Alguien escribe «USD 40» para no tener que ir a buscarlo. El día que el
 *       precio cambie, la página seguirá diciendo 40 y nadie se enterará hasta
 *       que un cliente reclame.
 *
 *   2 · Un botón promete algo que el producto no puede completar. Extra es el
 *       caso concreto: su mejora la cobra un carril que con la pasarela del
 *       lanzamiento no puede cobrar, y COMMERCIAL-UX-01B ya cerró que eso no se
 *       ofrece. Prometerlo desde una página pública sería el mismo defecto con
 *       más público.
 *
 *   3 · La página empieza a decidir dinero. Enseñar un precio y producir el
 *       total que se cobra son cosas distintas, y en cuanto se confunden hay
 *       dos verdades sobre cuánto vale algo.
 *
 * Correr: npm run test:cux01d
 */
import { readFileSync } from "node:fs";
import {
  resolvePlanCta, resolvePrimaryCta, CONTACT_HREF,
  type VisitorState, type PricingCapabilities,
} from "../../lib/plans/pricing-cta";
import { COMMERCIAL_FAQ, TAX_NOTICE } from "../../lib/plans/commercial-copy";

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function check(n: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}
const leer = (p: string) => readFileSync(p, "utf8");

const PAGINA = "app/planes/page.tsx";
const TARJETAS = "components/domain/commercial/pricing-plans.tsx";
const TABLA = "components/domain/commercial/plan-comparison.tsx";

/** Rutas que EXISTEN hoy. Un CTA que apunte fuera de aquí es una ruta inventada. */
const RUTAS_REALES = ["/register", "/login", "/select-org", "/settings/billing",
                      "/modules", "/faq", "/planes", "/", CONTACT_HREF];

const TODO: PricingCapabilities = { registrationOpen: true, upgradeTransactional: true };
const SIN_MEJORA: PricingCapabilities = { registrationOpen: true, upgradeTransactional: false };

const anonimo: VisitorState = { kind: "anonymous" };
const sinEmpresa: VisitorState = { kind: "authenticated_no_org" };
const empresa = (o: Partial<Extract<VisitorState, { kind: "organization" }>> = {})
  : VisitorState => ({
    kind: "organization", contractedPlanCode: "free", effectivePlanCode: "free",
    grantKind: "base", hasSubscription: false, cancelAtPeriodEnd: false, ...o });

console.log("\n1 · LA MATRIZ DE CTAs · SIETE SITUACIONES");

check("1A. Sin cuenta: se empieza creando cuenta, nunca contratando", () => {
  for (const plan of ["free", "full", "extra"]) {
    const c = resolvePlanCta(plan, anonimo, SIN_MEJORA);
    assert(c.href === "/register", `${plan} lleva a ${c.href}`);
  }
  assert(resolvePrimaryCta(anonimo, SIN_MEJORA).href === "/register",
    "el botón principal no lleva al registro");
});

check("1B. Con el registro cerrado, no se manda a nadie a una puerta cerrada", () => {
  const cerrado = { ...SIN_MEJORA, registrationOpen: false };
  const c = resolvePlanCta("full", anonimo, cerrado);
  assert(c.href === CONTACT_HREF, `lleva a ${c.href}`);
  assert(c.suppressedReason === "REGISTRATION_CLOSED", "no consta el motivo");
});

check("1C. Con cuenta y sin empresa: el paso que falta, y solo ese", () => {
  for (const plan of ["free", "full", "extra"]) {
    const c = resolvePlanCta(plan, sinEmpresa, TODO);
    assert(c.href === "/select-org", `${plan} lleva a ${c.href}`);
  }
});

check("1D. En Free: no se ofrece Free otra vez", () => {
  const c = resolvePlanCta("free", empresa(), TODO);
  assert(c.label === null, `se ofrece «${c.label}» a quien ya está en Free`);
  assert(c.suppressedReason === "ALREADY_ON_PLAN", "no consta el motivo");
  assert(resolvePlanCta("full", empresa(), TODO).href === "/settings/billing",
    "no se ofrece pasar a Full");
});

check("1E. En prueba: el camino corto, y se dice por qué", () => {
  const v = empresa({ contractedPlanCode: "free", effectivePlanCode: "full",
                      grantKind: "trial" });
  const c = resolvePlanCta("full", v, TODO);
  assert(c.label === "Contratar Full", `dice «${c.label}»`);
  assert(c.href === "/settings/billing", `lleva a ${c.href}`);
  assert(typeof c.note === "string" && /prueba/i.test(c.note),
    "no se menciona que la prueba termina");
});

check("1F. En Full activo: Full no se vuelve a ofrecer", () => {
  const v = empresa({ contractedPlanCode: "full", effectivePlanCode: "full",
                      grantKind: "sold", hasSubscription: true });
  const c = resolvePlanCta("full", v, TODO);
  assert(c.label === null && c.suppressedReason === "ALREADY_ON_PLAN",
    `se ofrece «${c.label}» a quien ya tiene Full`);
  // Y Free tampoco: bajar de plan es una decisión con fechas y consecuencias,
  // y eso vive en la ficha, no en un botón de una página de marketing.
  assert(resolvePlanCta("free", v, TODO).label === null,
    "se ofrece bajar a Free desde una página pública");
});

check("1G. En Full con la cancelación programada: se puede volver atrás", () => {
  const v = empresa({ contractedPlanCode: "full", effectivePlanCode: "full",
                      grantKind: "sold", hasSubscription: true,
                      cancelAtPeriodEnd: true });
  const c = resolvePlanCta("full", v, TODO);
  assert(c.href === "/settings/billing", `lleva a ${c.href}`);
  assert(typeof c.note === "string" && /cancelaci/i.test(c.note),
    "no se dice que hay una cancelación programada");
});

check("1H. En Extra: Extra no se vuelve a ofrecer", () => {
  const v = empresa({ contractedPlanCode: "extra", effectivePlanCode: "extra",
                      grantKind: "sold", hasSubscription: true });
  assert(resolvePlanCta("extra", v, TODO).label === null,
    "se ofrece Extra a quien ya tiene Extra");
});

console.log("\n2 · EL CTA DE EXTRA · EL QUE NO PUEDE MENTIR");

check("2A. Sin carril que cobre la mejora, NO se promete un upgrade", () => {
  const v = empresa({ contractedPlanCode: "full", effectivePlanCode: "full",
                      grantKind: "sold", hasSubscription: true });
  const c = resolvePlanCta("extra", v, SIN_MEJORA);
  assert(c.href === CONTACT_HREF,
    `se ofrece un upgrade que no puede completarse: ${c.href}`);
  assert(c.suppressedReason === "UPGRADE_NOT_TRANSACTIONAL", "no consta el motivo");
  assert(!/pasar a extra|contratar extra|subir a extra/i.test(c.label ?? ""),
    `el texto promete una transacción: «${c.label}»`);
});

check("2B. Y el día que el carril pueda cobrar, se ofrece solo", () => {
  // La decisión se pregunta por CAPACIDAD. Cuando cambie, esto cambia con ella
  // sin que nadie tenga que acordarse de volver aquí.
  const v = empresa({ contractedPlanCode: "full", effectivePlanCode: "full",
                      grantKind: "sold", hasSubscription: true });
  const c = resolvePlanCta("extra", v, TODO);
  assert(c.href === "/settings/billing", `lleva a ${c.href}`);
});

check("2C. La página consulta la MISMA autoridad que la ficha", () => {
  const p = leer(PAGINA);
  assert(/resolveUpgradeAvailability\(\)\.transactional/.test(p),
    "la página decide por su cuenta si Extra se puede contratar");
});

console.log("\n3 · NINGÚN BOTÓN COBRA, Y NINGUNO INVENTA UNA RUTA");

check("3A. Todos los destinos existen", () => {
  const estados: VisitorState[] = [anonimo, sinEmpresa,
    empresa(), empresa({ grantKind: "trial", effectivePlanCode: "full" }),
    empresa({ contractedPlanCode: "full", hasSubscription: true }),
    empresa({ contractedPlanCode: "full", hasSubscription: true, cancelAtPeriodEnd: true }),
    empresa({ contractedPlanCode: "extra", hasSubscription: true })];
  for (const v of estados) {
    for (const caps of [TODO, SIN_MEJORA, { ...TODO, registrationOpen: false }]) {
      for (const plan of ["free", "full", "extra"]) {
        const c = resolvePlanCta(plan, v, caps);
        if (c.href === null) continue;
        assert(RUTAS_REALES.includes(c.href),
          `ruta inventada: ${c.href} (${v.kind}/${plan})`);
      }
      const p = resolvePrimaryCta(v, caps);
      assert(p.href === null || RUTAS_REALES.includes(p.href),
        `ruta inventada en el botón principal: ${p.href}`);
    }
  }
});

check("3B. La página no dispara ningún cobro", () => {
  // Orienta; no cobra. El checkout sigue siendo el checkout.
  for (const f of [PAGINA, TARJETAS, TABLA]) {
    const src = leer(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    for (const prohibido of ["billing_create_quote", "createBillingQuote",
                             "startCheckout", "submitCardToken", "confirmUpgradeAction",
                             "quoteUpgradeAction", "\\.rpc\\("]) {
      assert(!new RegExp(prohibido).test(src),
        `${f} toca el camino del cobro: ${prohibido}`);
    }
  }
});

check("3C. Ni calcula impuestos, ni cambio, ni descuentos", () => {
  for (const f of [PAGINA, TARJETAS, TABLA, "lib/plans/pricing-cta.ts"]) {
    const src = leer(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    for (const prohibido of ["billing_resolve_tax_rule", "tax_rule", "basis_points",
                             "fx_rate", "commercial_fx", "promotion", "redemption"]) {
      assert(!new RegExp(prohibido, "i").test(src), `${f} toca ${prohibido}`);
    }
  }
  assert(/antes de impuestos/i.test(TAX_NOTICE),
    "no se advierte que los precios son antes de impuestos");
  assert(!/19|IVA \d|%/.test(TAX_NOTICE),
    "la advertencia de impuestos asume una tasa concreta");
});

console.log("\n4 · NI UNA CIFRA ESCRITA A MANO");

check("4A. Ni precios ni límites en la página ni en sus componentes", () => {
  const cifras = ["4000", "40000", "10000", "100000", "40", "400", "100", "1000",
                  "52428800", "524288000", "5368709120", "25", "500", "2000",
                  "30", "300", "600", "50", "48"];
  for (const f of [PAGINA, TARJETAS, TABLA]) {
    // Las clases de estilo se quitan ANTES de buscar. `border-loop/30`,
    // `max-w-5xl` y `py-14` llevan números que no son cifras de negocio, y una
    // prueba que no distingue las dos cosas da un rojo que no es — cuesta más
    // que no tenerla, porque enseña a ignorarla.
    const src = leer(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "")
      .replace(/className=(?:"[^"]*"|\{`[^`]*`\}|\{[^}]*\})/g, "")
      .replace(/clase = [\s\S]*?;/g, "").replace(/const foco = [\s\S]*?;/g, "");
    for (const n of cifras) {
      assert(!new RegExp(`\\b${n}\\b`).test(src),
        `${f} escribe ${n} a mano: si la autoridad cambia, la página miente`);
    }
  }
});

check("4B. Todo sale del catálogo", () => {
  const p = leer(PAGINA);
  assert(/readCommercialCatalog\(\)/.test(p), "la página no lee el catálogo canónico");
  const t = leer(TARJETAS);
  for (const formateador of ["formatUsdPrice", "formatStorage", "formatAiCredits",
                             "formatTimeUsage"]) {
    assert(new RegExp(formateador).test(t),
      `las tarjetas no usan ${formateador}: hay un formato propio`);
  }
});

check("4C. Y no hay un segundo lector", () => {
  for (const f of [PAGINA, TARJETAS, TABLA]) {
    const src = leer(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    for (const prohibido of ["v_public_plan_catalog", "v_public_plan_limits",
                             "plan_revisions", "plan_revision_limits",
                             "createAdminClient", "service_role"]) {
      assert(!new RegExp(prohibido).test(src),
        `${f} consulta ${prohibido} por su cuenta`);
    }
  }
});

console.log("\n5 · LO QUE LA PÁGINA DICE CUANDO NO SABE");

check("5A. Sin catálogo NO se pinta una parrilla vacía", () => {
  // Una página de precios sin planes le dice a quien la mire que no vendemos
  // nada. Es peor que decir que ahora mismo no se puede mostrar.
  const p = leer(PAGINA);
  assert(/catalogo === null \? \(/.test(p),
    "la página no contempla que el catálogo no se pueda leer");
  assert(/no podemos mostrar los planes/i.test(p),
    "no se le dice nada a quien llega cuando el catálogo falla");
});

check("5B. Un precio ausente no se escribe como cero", () => {
  const t = leer(TARJETAS);
  assert(/precio === null \? \(/.test(t), "no se contempla un precio ausente");
  assert(/Precio a consultar/.test(t),
    "un precio ausente no dice nada, o peor, dice una cifra");
});

check("5C. Un límite sin decidir no se le enseña a un cliente", () => {
  const c = leer(TABLA);
  assert(/formatLimitForCustomer/.test(c),
    "la comparación formatea por su cuenta y puede enseñar «Sin configurar»");
  assert(/filas = codigos\.filter/.test(c),
    "se pintan filas que ningún plan puede responder");
});

check("5D. Y la comparación no lleva una lista de recursos escrita a mano", () => {
  // Las filas salen de lo que la autoridad declara. Así no hay dónde inventar
  // una diferencia que no existe.
  const c = leer(TABLA);
  assert(/planes\.flatMap\(\(p\) => p\.limits/.test(c),
    "las filas de la comparación no salen de los límites del catálogo");
});

console.log("\n6 · LA PRUEBA NO ES UN CUARTO PLAN");

check("6A. Se presenta aparte y se dice de qué plan es", () => {
  const p = leer(PAGINA);
  assert(/catalogo\.trial|prueba !== null/.test(p), "no se presenta la prueba");
  assert(/no un plan aparte/.test(p),
    "no se aclara que la prueba es una concesión, no un plan");
  assert(/trialTagline/.test(p), "el titular de la prueba no sale del catálogo");
});

check("6B. Y sus créditos no se confunden con los del plan contratado", () => {
  const p = leer(PAGINA);
  assert(/no se suman a los del plan contratado/.test(p),
    "no se distingue la bolsa de la prueba de la del plan");
});

console.log("\n7 · EL ACOMPAÑAMIENTO, FUERA DE LA JERARQUÍA");

check("7A. Sección propia y la frase que evita el malentendido", () => {
  const p = leer(PAGINA);
  assert(/complemento opcional, no un plan/.test(p),
    "no se dice explícitamente que no es un plan");
  assert(/catalogo\.services/.test(p),
    "el Acompañamiento no sale de `services`");
  // Lo que importa no es la distancia en el fichero —las dos secciones son
  // contiguas y eso no significa nada— sino que el componente de planes NUNCA
  // reciba servicios, y que la sección de planes no los mencione.
  assert(/<PricingPlans\s+planes=\{catalogo\.saasPlans/.test(p.replace(/\s+/g, " ")),
    "el componente de planes recibe algo que no son los planes SaaS");
  const seccionPlanes = p.slice(p.indexOf('id="planes"'), p.indexOf("4 · LA COMPARACIÓN"));
  assert(!/services|acompa/i.test(seccionPlanes),
    "la sección de planes menciona el Acompañamiento: lo hace parecer un cuarto plan");
});

check("7B. Sin SKU, sin checkout, sin suscripción", () => {
  const p = leer(PAGINA).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  const i = p.indexOf("acompanamiento");
  const bloque = i > 0 ? p.slice(i - 500, i + 2000) : "";
  for (const prohibido of ["checkout", "quote", "subscription", "sku"]) {
    assert(!new RegExp(prohibido, "i").test(bloque),
      `el Acompañamiento toca ${prohibido}`);
  }
});

console.log("\n8 · FAQ · SOLO REGLAS COMPROBADAS");

check("8A. Cada respuesta dice de dónde sale", () => {
  assert(COMMERCIAL_FAQ.length >= 5, `solo hay ${COMMERCIAL_FAQ.length} preguntas`);
  for (const q of COMMERCIAL_FAQ) {
    assert(q.basis.length > 20,
      `«${q.question}» no declara en qué regla se apoya`);
  }
});

check("8B. Y no promete garantías que nadie implementó", () => {
  const texto = COMMERCIAL_FAQ.map((q) => q.answer).join(" ").toLowerCase();
  for (const promesa of ["garantizamos", "devolución", "reembolso",
                         "satisfacción garantizada", "cancela cuando quieras y te",
                         "sin compromiso alguno"]) {
    assert(!texto.includes(promesa),
      `la FAQ promete «${promesa}» y no hay regla que lo sostenga`);
  }
});

check("8C. Ni una cifra de negocio en las respuestas", () => {
  // Salvo la duración de la prueba, que es la única que la propia FAQ necesita
  // nombrar para responder «qué pasa a las 48 horas». Y aun así se apoya en que
  // la política lo diga: si cambiara, esta prueba obliga a revisarlo.
  const texto = COMMERCIAL_FAQ.map((q) => q.answer).join(" ");
  for (const n of ["4000", "40", "400", "500", "2000", "300", "30", "380"]) {
    assert(!new RegExp(`\\b${n}\\b`).test(texto),
      `la FAQ escribe la cifra ${n}: se desincronizará de la autoridad`);
  }
});

console.log("\n9 · LA CÁSCARA Y LA METADATA");

check("9A. Se reutiliza PublicShell · no hay un segundo shell", () => {
  const p = leer(PAGINA);
  assert(/<PublicShell/.test(p), "la página no usa la cáscara pública");
  assert(!/<header|<footer/.test(p),
    "la página escribió su propia cabecera o su propio pie");
});

check("9B. Metadata sin afirmaciones que no podamos sostener", () => {
  const p = leer(PAGINA);
  assert(/export async function generateMetadata/.test(p), "no hay metadata");
  assert(/title:/.test(p) && /description:/.test(p), "falta título o descripción");
  const meta = p.slice(p.indexOf("generateMetadata"), p.indexOf("export default"));
  for (const claim of ["líder", "el mejor", "#1", "número 1", "más usado",
                       "certificado por", "garantizado"]) {
    assert(!new RegExp(claim, "i").test(meta),
      `la metadata afirma «${claim}» sin poder demostrarlo`);
  }
});

check("9B.2. Y la duración de la prueba tampoco se escribe en la metadata", () => {
  // Lo que queda en un buscador se corrige tarde y mal: quien llega desde ahí ya
  // leyó la promesa vieja. La primera versión de esta página lo hacía.
  const p = leer(PAGINA);
  const meta = p.slice(p.indexOf("generateMetadata"), p.indexOf("export default"));
  assert(/trialTagline/.test(meta),
    "la metadata no compone el titular de la prueba desde el catálogo");
  assert(!/\b48\b/.test(meta), "la metadata escribe la duración a mano");
});

check("9C. Y la página no se marca como no indexable", () => {
  const p = leer(PAGINA);
  assert(!/noindex|robots:\s*\{[^}]*index:\s*false/.test(p),
    "la página de precios se excluye de los buscadores sin motivo");
});

console.log("\n10 · JERARQUÍA Y ACCESIBILIDAD");

check("10A. Un solo h1, y cada sección con su h2", () => {
  const p = leer(PAGINA);
  const h1 = (p.match(/<h1/g) ?? []).length;
  assert(h1 === 1, `hay ${h1} encabezados de primer nivel`);
  const h2 = (p.match(/<h2/g) ?? []).length;
  assert(h2 >= 4, `solo ${h2} secciones tituladas`);
  // Y las tarjetas van por debajo de su sección.
  assert(/<h3/.test(leer(TARJETAS)), "las tarjetas no titulan el plan");
});

check("10B. Cada sección se anuncia por su título", () => {
  const p = leer(PAGINA);
  const etiquetadas = (p.match(/aria-labelledby=/g) ?? []).length;
  assert(etiquetadas >= 4,
    `solo ${etiquetadas} secciones se anuncian con su título`);
});

check("10C. El selector mensual/anual es un grupo de radios de verdad", () => {
  // Con dos botones habría que reimplementar el anuncio «1 de 2» y las flechas,
  // y quedarían a medias. Con radios lo hace el navegador.
  const t = leer(TARJETAS);
  assert(/<fieldset/.test(t) && /<legend/.test(t),
    "el selector no es un grupo con nombre");
  assert(/type="radio"/.test(t), "el selector no usa radios");
  assert(/Periodicidad del precio/.test(t), "el grupo no tiene nombre accesible");
  assert(/focus-within:outline/.test(t),
    "al tabular al selector no se ve dónde está el foco");
});

check("10D. La tabla de comparación es navegable a ciegas", () => {
  const c = leer(TABLA);
  assert(/<caption/.test(c), "la tabla no tiene título");
  assert(/scope="col"/.test(c) && /scope="row"/.test(c),
    "sin `scope`, una tabla de comparación es una lista de números sueltos");
});

check("10E. Botones que se distinguen al tabular", () => {
  const t = leer(TARJETAS);
  assert(/aria-label=\{nombre\}/.test(t),
    "tres botones «Pasar a Full» suenan iguales fuera de contexto");
  assert(/plan \$\{plan\}/.test(t), "el nombre accesible no lleva el plan");
});

check("10F. Foco visible en todo lo enfocable", () => {
  for (const f of [PAGINA, TARJETAS]) {
    const src = leer(f);
    const enlaces = (src.match(/<Link|<a\s/g) ?? []).length;
    const focos = (src.match(/focus-visible:outline|focus-within:outline/g) ?? []).length;
    assert(focos >= Math.min(enlaces, 2),
      `${f}: ${enlaces} enlaces y ${focos} con foco visible`);
  }
});

console.log("\n11 · RESPONSIVE · SIN DESBORDES");

check("11A. Las tarjetas se apilan en móvil", () => {
  const t = leer(TARJETAS);
  assert(/grid gap-6 md:grid-cols-3/.test(t),
    "las tres tarjetas no se apilan en pantalla estrecha");
});

check("11B. La tabla se desplaza DENTRO de su caja, no la página", () => {
  // Es la diferencia entre una tabla incómoda y una página rota.
  const c = leer(TABLA);
  assert(/overflow-x-auto/.test(c), "la tabla desborda la página en móvil");
  assert(/min-w-\[/.test(c), "sin ancho mínimo la tabla se comprime ilegible");
});

check("11C. Sin anchos fijos en píxeles que rompan una pantalla pequeña", () => {
  for (const f of [PAGINA, TARJETAS]) {
    assert(!/\bw-\[\d+px\]|\bmin-w-\[\d{3,}px\]/.test(leer(f)),
      `${f} tiene un ancho fijo que puede desbordar`);
  }
});

check("11D. Y nada depende de pasar el ratón por encima", () => {
  // En un móvil no hay ratón. Un dato que solo aparece al pasar por encima no
  // existe para la mitad de quien visita una página de precios.
  for (const f of [PAGINA, TARJETAS, TABLA]) {
    const src = leer(f);
    assert(!/group-hover:(block|flex|visible|opacity-100)/.test(src),
      `${f} esconde contenido detrás de un hover`);
  }
});

console.log(`\nCOMMERCIAL-UX-01D · página de precios: ${passed} en verde, ${failed} en rojo`);
if (failed > 0) process.exit(1);
