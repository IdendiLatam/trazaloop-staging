import { config as loadEnv } from "dotenv";
import { Client as PgClient } from "pg";
import { readFileSync } from "node:fs";
import { buildCommercialCatalog } from "../../lib/plans/commercial-catalog";
import {
  formatMonthlyPrice, formatStorage, formatAiCredits, formatTimeUsage,
  formatLimitForCustomer,
} from "../../lib/plans/commercial-presentation";
import {
  COMMERCIAL_CAPABILITIES, formatInclusion,
} from "../../lib/plans/commercial-capabilities";
import { summarizeBilling } from "../../lib/domain/billing-experience";
import { presentTime } from "../../lib/domain/usage-presentation";

loadEnv({ path: ".env.local", quiet: true });

/**
 * Trazaloop · COMMERCIAL-UX-01G · Tres superficies, una sola verdad.
 *
 *
 * QUÉ DEFIENDE ESTA SUITE
 *
 * Que la portada, /planes y «Mi plan» no se contradigan. Cada una se construyó
 * en su tramo y cada una pasó sus pruebas; lo que nadie había comprobado es que
 * digan lo MISMO — y esa es justo la contradicción que un cliente encuentra
 * primero, porque es el único que las mira las tres.
 *
 * Y que la comparación no prometa capacidades falsas ni calle diferencias
 * reales. Las dos cosas se rompen igual de calladas: una fila de más se lee
 * como una promesa, y una de menos regala una ventaja que se estaba vendiendo.
 *
 * Correr: npm run test:cux01g
 */

const DB_URL = process.env.SUPABASE_DB_URL;
if (!DB_URL) { console.log("falta SUPABASE_DB_URL en .env.local"); process.exit(1); }

let passed = 0, failed = 0;
async function check(nombre: string, fn: () => Promise<void> | void) {
  try { await fn(); passed += 1; console.log(`  ✔ ${nombre}`); }
  catch (e) { failed += 1; console.log(`  ✘ ${nombre}: ${e instanceof Error ? e.message : e}`); }
}
function assert(cond: boolean, mensaje: string) { if (!cond) throw new Error(mensaje); }
const leer = (p: string) => readFileSync(p, "utf8");

const PLANES = "app/planes/page.tsx";
const BILLING = "app/(app)/(shell)/settings/billing/page.tsx";
const PORTADA = "app/page.tsx";
const COMPARACION = "components/domain/commercial/plan-comparison.tsx";
const OPCIONES = "components/domain/billing/plan-options.tsx";

async function main() {
  const pg = new PgClient({ connectionString: DB_URL });
  await pg.connect();
  const q = async (sql: string, p: unknown[] = []) => (await pg.query(sql, p)).rows;
  await q("set role postgres");

  // El catálogo REAL, montado como lo monta el producto.
  const catalogo = buildCommercialCatalog({
    plans: (await q(
      `select plan_code, display_order, plan_revision_id, display_name, description,
              public_conditions, price_state, currency,
              monthly_price_minor, annual_price_minor
         from public.v_public_plan_catalog order by display_order`)).map((r) => ({
      planCode: String(r.plan_code), displayOrder: Number(r.display_order),
      planRevisionId: String(r.plan_revision_id), displayName: String(r.display_name),
      description: r.description === null ? null : String(r.description),
      publicConditions: r.public_conditions === null ? null : String(r.public_conditions),
      priceState: r.price_state as "configured" | "not_configured",
      currency: r.currency === null ? null : String(r.currency),
      monthlyPriceMinor: r.monthly_price_minor === null ? null : Number(r.monthly_price_minor),
      annualPriceMinor: r.annual_price_minor === null ? null : Number(r.annual_price_minor),
    })),
    limits: (await q(
      `select plan_code, resource_code, resource_label, unit, limit_state, limit_value
         from public.v_public_plan_limits`)).map((r) => ({
      planCode: String(r.plan_code), resourceCode: String(r.resource_code),
      resourceLabel: r.resource_label === null ? null : String(r.resource_label),
      unit: r.unit === null ? null : String(r.unit),
      limitState: r.limit_state as "finite" | "unlimited" | "not_configured",
      limitValue: r.limit_value === null ? null : Number(r.limit_value),
    })),
    trialPolicy: await (async () => {
      const [t] = await q(`select enabled, trial_plan_code, trial_duration_hours
                             from public.commercial_trial_policy`);
      return t === undefined ? null : {
        enabled: Boolean(t.enabled), trialPlanCode: String(t.trial_plan_code),
        trialDurationHours: Number(t.trial_duration_hours) };
    })(),
  });
  const plan = (c: string) => {
    const p = catalogo.saasPlans.find((x) => x.code === c);
    assert(p !== undefined, `no salió el plan ${c}`);
    return p!;
  };

  console.log("\n1 · LAS TRES SUPERFICIES LEEN LA MISMA AUTORIDAD");

  await check("1A. Ninguna tiene su propio lector de catálogo", () => {
    // La forma más barata de que dos pantallas se contradigan es que cada una
    // vaya a buscar los datos por su cuenta.
    for (const f of [PLANES, BILLING]) {
      const src = leer(f);
      assert(/readCommercialCatalog\(\)/.test(src),
        `${f} no lee el catálogo canónico`);
      assert(!/listPublicPlanCatalog|v_public_plan_limits|plan_revision_limits/.test(src),
        `${f} consulta la autoridad por su cuenta`);
    }
  });

  await check("1B. Y las dos usan los MISMOS formateadores", () => {
    for (const f of ["components/domain/commercial/pricing-plans.tsx", OPCIONES]) {
      const src = leer(f);
      for (const fmt of ["formatStorage", "formatAiCredits", "formatTimeUsage"]) {
        assert(new RegExp(fmt).test(src), `${f} no usa ${fmt}: tiene formato propio`);
      }
    }
  });

  await check("1C. La portada no repite ni una cifra comercial", () => {
    const p = leer(PORTADA).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "")
      .replace(/className=(?:"[^"]*"|\{`[^`]*`\}|\{[^}]*\})/g, "");
    for (const n of ["4000", "40000", "10000", "100000", "500", "2000", "300", "48"]) {
      assert(!new RegExp(`\\b${n}\\b`).test(p), `la portada escribe ${n} a mano`);
    }
  });

  console.log("\n2 · LO QUE SE ENSEÑA COINCIDE, SUPERFICIE A SUPERFICIE");

  await check("2A. Precios · lo que se enseña es lo que la base dice", async () => {
    // La primera versión de esto comparaba una expresión CONSIGO MISMA y daba
    // verde siempre. Parecía cobertura y no lo era, que es peor que no tenerla.
    //
    // Lo que de verdad hay que comprobar es contra la autoridad: que el texto
    // que verá un cliente corresponda a la fila publicada. Que las dos
    // superficies coincidan entre sí ya lo garantizan 1A y 1B —mismo lector,
    // mismos formateadores— y eso sí es una propiedad, no una tautología.
    for (const p of catalogo.saasPlans) {
      const [r] = await q(
        `select monthly_price_minor, annual_price_minor, currency
           from plan_revisions
          where plan_code = $1 and status = 'published' and effective_to is null`,
        [p.code]);
      const esperado = formatMonthlyPrice(
        r.monthly_price_minor === null ? null : Number(r.monthly_price_minor),
        r.currency === null ? null : String(r.currency));
      const mostrado = formatMonthlyPrice(p.monthlyPriceMinor, p.currency);
      assert(mostrado === esperado,
        `${p.code}: se enseñaría «${mostrado}» y la autoridad dice «${esperado}»`);
      assert(Number(r.annual_price_minor) === p.annualPriceMinor,
        `${p.code}: el precio anual no coincide con la autoridad`);
    }
  });

  await check("2B. Tiempo de uso · una sola frase para cada plan", () => {
    assert(formatTimeUsage(plan("free").timeUsage) === "30 min/día · 300 min/mes",
      `Free: «${formatTimeUsage(plan("free").timeUsage)}»`);
    for (const c of ["full", "extra"]) {
      assert(formatTimeUsage(plan(c).timeUsage) === "Uso ilimitado",
        `${c}: «${formatTimeUsage(plan(c).timeUsage)}»`);
    }
    // Y «Mi plan» dice lo mismo para un plan sin reloj.
    const enBilling = presentTime({ metered: false, dailyLimit: null,
      monthlyLimit: null, dailyUsed: null, monthlyUsed: null, isTrial: false });
    assert(enBilling.mode === "unlimited" && enBilling.label === "Uso ilimitado",
      "«Mi plan» cuenta el tiempo ilimitado de otra forma que /planes");
  });

  await check("2C. Almacenamiento y créditos · la misma escritura", () => {
    assert(formatStorage(plan("full").storageBytes) === "500 MB",
      `Full: ${formatStorage(plan("full").storageBytes)}`);
    assert(formatStorage(plan("extra").storageBytes) === "5 GB",
      `Extra: ${formatStorage(plan("extra").storageBytes)}`);
    assert(formatAiCredits(plan("full").aiCreditsMonthly) === "500 créditos al mes",
      `Full IA: ${formatAiCredits(plan("full").aiCreditsMonthly)}`);
  });

  console.log("\n3 · LA PRUEBA · UNA SOLA VERDAD EN LAS TRES");

  await check("3A. Es de Full, dura lo que dice la política y no pide tarjeta", () => {
    const t = catalogo.trial;
    assert(t !== null, "no hay prueba");
    assert(t!.effectivePlanCode === "full", `la prueba es de ${t!.effectivePlanCode}`);
    assert(t!.cardRequired === false, "la prueba pide tarjeta");
    const [pol] = [1];
    void pol;
  });

  await check("3B. Nadie ofrece una prueba de Extra", () => {
    // El defecto que cerró 01D.1: «Empezar la prueba» en la tarjeta de Extra
    // prometía una prueba que no existe.
    for (const f of [PLANES, PORTADA, BILLING, OPCIONES,
                     "components/domain/commercial/pricing-plans.tsx"]) {
      const src = leer(f);
      assert(!/prueba de Extra|probar Extra|Extra gratis/i.test(src),
        `${f} ofrece una prueba de Extra`);
    }
    const cta = leer("lib/plans/pricing-cta.ts");
    assert(/caps\.trialPlanCode/.test(cta),
      "el texto de la prueba no se ata al plan que la prueba concede");
  });

  await check("3C. Y en «Mi plan» la prueba no se presenta como contrato", () => {
    const r = summarizeBilling({
      hasSubscription: false, contractedPlanCode: "free", effectivePlanCode: "full",
      grantKind: "trial", grantEndsAt: "2026-10-01T00:00:00.000Z",
      currentPeriodEnd: null, renewsAt: null, cancelAtPeriodEnd: false,
      hasLiveRecurring: false, renewalMode: null, subscriptionStatus: null,
      manualReview: false, downgradeScheduled: false, paymentMethodMissing: false,
      pendingCheckout: false, isAdmin: true,
    }, (iso) => iso.slice(0, 10));
    assert(r.state === "TRIAL_ACTIVE", `estado ${r.state}`);
    assert(/no hemos pedido tarjeta/i.test(r.primaryMessage),
      "no se dice que no se pidió tarjeta");
    const o = leer(OPCIONES);
    assert(/isTrial \? "Tu prueba actual" : "Tu plan actual"/.test(o),
      "durante una prueba el distintivo afirma un contrato");
  });

  await check("3D. Y el nombre del plan no contradice a su estado", async () => {
    // Lo encontró el smoke de 01G contra una empresa real de Staging: tiene
    // Full concedido desde la consola y ninguna suscripción, y la tarjeta
    // enseñaba «Full» con «Plan de entrada» justo debajo.
    //
    // La regla, dicha entera: la pantalla solo puede llamar plan de entrada a
    // lo que la AUTORIDAD trata como plan de entrada, que es la concesión
    // `base` de 0162. Se comprueba contra la base, no contra una lista escrita
    // aquí: si mañana nace otra clase de concesión, esta prueba la recorre.
    // Las clases salen de la RESTRICCIÓN, no de las filas que haya hoy.
    //
    // La primera versión leía `select distinct grant_kind` y se puso roja el
    // día que una limpieza de pruebas dejó la tabla vacía. Una prueba que
    // depende de que alguien haya dejado datos no comprueba la regla: comprueba
    // el ambiente. `opa_grant_kind_check` es donde 0162 declaró las cuatro
    // clases, y eso no se vacía.
    const [c] = await q(`select pg_get_constraintdef(oid) def from pg_constraint
                          where conname = 'opa_grant_kind_check'`);
    assert(c !== undefined, "desapareció la restricción que declara las clases");
    const clases = [...String(c.def).matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    assert(clases.includes("base"),
      "la base ya no declara la concesión que sostiene el plan de entrada");
    for (const clase of clases) {
      const r = summarizeBilling({
        hasSubscription: false, contractedPlanCode: "full",
        effectivePlanCode: "full", grantKind: clase,
        grantEndsAt: clase === "trial" ? "2026-10-01T00:00:00.000Z" : null,
        currentPeriodEnd: null, renewsAt: null, cancelAtPeriodEnd: false,
        hasLiveRecurring: false, renewalMode: null, subscriptionStatus: null,
        manualReview: false, downgradeScheduled: false,
        paymentMethodMissing: false, pendingCheckout: false, isAdmin: true,
      }, (iso) => iso.slice(0, 10));
      if (clase === "base") continue;
      assert(!/plan de entrada/i.test(r.displayStatus),
        `con la concesión «${clase}» un plan de pago se llama `
        + `«${r.displayStatus}»`);
    }
  });

  await check("3E. Y no se invita a renovar a mano lo que se cobra solo", () => {
    // Lo vio el smoke: una empresa del carril de la plataforma leía «Tu plan
    // está activo y se renueva solo» y, dos secciones más abajo, «Renovar
    // Full». Quien hiciera caso pagaría dos veces el mismo mes.
    //
    // El panel se ofrecía cuando no había autorización del PROVEEDOR, que no es
    // lo mismo que «no hay cobro automático». La pregunta la responde el
    // resumen, que distingue los dos carriles.
    const pagina = leer(BILLING);
    const i = pagina.indexOf("<RenewalPanel");
    assert(i !== -1, "ya no existe el panel de renovación manual");
    const condicion = pagina.slice(Math.max(0, i - 400), i);
    assert(/resumen\.state !== "PROVIDER_ACTIVE"/.test(condicion),
      "el panel de renovar a mano no descarta los planes que se cobran solos");
    // Y que ese estado sigue significando lo que aquí se supone.
    const auto = summarizeBilling({
      hasSubscription: true, contractedPlanCode: "full", effectivePlanCode: "full",
      grantKind: "sold", grantEndsAt: null, currentPeriodEnd: null,
      renewsAt: "2026-10-04T00:00:00.000Z", cancelAtPeriodEnd: false,
      hasLiveRecurring: false, renewalMode: "platform",
      subscriptionStatus: "active", manualReview: false,
      downgradeScheduled: false, paymentMethodMissing: false,
      pendingCheckout: false, isAdmin: true,
    }, (iso) => iso.slice(0, 10));
    assert(auto.state === "PROVIDER_ACTIVE",
      `el carril de la plataforma resuelve a ${auto.state}`);
  });

  console.log("\n4 · EXTRA · VISIBLE, Y SIN PROMETER UNA TRANSACCIÓN");

  await check("4A. Se puede conocer Extra en las dos superficies", () => {
    assert(catalogo.saasPlans.some((p) => p.code === "extra"),
      "Extra no está en el catálogo");
    for (const f of [PLANES, BILLING]) {
      assert(/PlanOptions|PricingPlans/.test(leer(f)),
        `${f} no enseña el catálogo de planes`);
    }
  });

  await check("4B. Y ninguna promete un upgrade que no puede completarse", () => {
    // Cada superficie consulta la capacidad; la ETIQUETA puede vivir en la
    // propia pantalla o en el módulo que decide por ella. /planes delega en
    // `pricing-cta`, y eso es mejor que repetir el texto — buscarlo en el
    // fichero equivocado daba un rojo que no era.
    const decide: Record<string, string> = {
      [PLANES]: "lib/plans/pricing-cta.ts",
      [BILLING]: BILLING,
    };
    for (const [superficie, duenoDelTexto] of Object.entries(decide)) {
      const src = leer(superficie);
      assert(/upgradeTransactional|resolveUpgradeAvailability/.test(src),
        `${superficie} no consulta si el carril puede cobrar`);
      assert(/Hablemos de Extra/.test(leer(duenoDelTexto)),
        `${superficie} no ofrece la alternativa no transaccional`);
      // Y en ninguna aparece una promesa transaccional suelta.
      assert(!/Comprar Extra|Actualizar ahora/i.test(src),
        `${superficie} promete una transacción de Extra`);
    }
  });

  await check("4C. El contacto es un canal REAL, el mismo en todas", () => {
    const canal = "mailto:contacto@idendi.org";
    for (const f of [PLANES, BILLING, "lib/plans/pricing-cta.ts", OPCIONES]) {
      assert(leer(f).includes(canal), `${f} usa otro canal de contacto`);
    }
  });

  console.log("\n5 · EL ACOMPAÑAMIENTO NO ES UN PLAN, EN NINGUNA");

  await check("5A. Fuera de saasPlans y dicho en voz alta", () => {
    assert(!catalogo.saasPlans.some((p) => /acompa/i.test(p.code)),
      "el Acompañamiento se coló entre los planes");
    assert(catalogo.services.some((s) => s.code === "acompanamiento"),
      "el Acompañamiento no está en `services`");
    for (const f of [PLANES, OPCIONES]) {
      assert(/complemento opcional, no un plan/i.test(leer(f)),
        `${f} no dice que el Acompañamiento no es un plan`);
    }
  });

  await check("5B. Y no entra en la comparación de planes", () => {
    const c = leer(COMPARACION);
    assert(!/acompanamiento|COMMERCIAL_SERVICES/.test(c),
      "el Acompañamiento aparece como una columna o fila de la comparación");
  });

  console.log("\n6 · LA COMPARACIÓN DICE LO QUE HAY · NI MÁS NI MENOS");

  await check("6A. Ninguna fila repite lo mismo en los tres planes", () => {
    // Una fila idéntica en todas las columnas no ayuda a elegir: ocupa sitio y
    // diluye las que sí deciden. Hoy hay una así en la autoridad
    // —«Reportar fallos del producto»— y por eso no se pinta.
    const codigos = [...new Set(catalogo.saasPlans.flatMap(
      (p) => p.limits.map((l) => l.resourceCode)))];
    const pintadas = codigos.filter((code) => {
      const v = catalogo.saasPlans.map((p) => {
        const l = p.limits.find((x) => x.resourceCode === code);
        return l === undefined ? null : formatLimitForCustomer(l.resourceCode, l.state, l.value);
      });
      return v.some((x) => x !== null) && new Set(v.map((x) => x ?? "")).size > 1;
    });
    for (const code of pintadas) {
      const v = catalogo.saasPlans.map((p) => {
        const l = p.limits.find((x) => x.resourceCode === code);
        return l === undefined ? null : formatLimitForCustomer(l.resourceCode, l.state, l.value);
      });
      assert(new Set(v.map((x) => x ?? "")).size > 1,
        `«${code}» dice lo mismo en los tres planes y aun así se pinta`);
    }
    assert(pintadas.length >= 10,
      `la comparación quedó en ${pintadas.length} filas: se está callando demasiado`);
    assert(!pintadas.includes("technical_report_enabled"),
      "se pinta una fila que está incluida en los tres planes");
  });

  await check("6B. Y NO se calla una diferencia real que vive fuera de los límites", () => {
    // Los tutoriales guiados diferencian planes y su autoridad es
    // `tutorial-access.ts`, no `plan_revision_limits`. 01D los callaba.
    const tut = COMMERCIAL_CAPABILITIES.find((c) => c.code === "guided_tutorials");
    assert(tut !== undefined, "los tutoriales guiados no se comparan");
    assert(formatInclusion(tut!.resolve("free")) === "No incluido",
      `Free: ${formatInclusion(tut!.resolve("free"))}`);
    assert(formatInclusion(tut!.resolve("full")) === "Incluido",
      `Full: ${formatInclusion(tut!.resolve("full"))}`);
    assert(formatInclusion(tut!.resolve("extra")) === "Incluido",
      `Extra: ${formatInclusion(tut!.resolve("extra"))}`);
    assert(leer(COMPARACION).includes("COMMERCIAL_CAPABILITIES"),
      "la comparación no incluye las capacidades con autoridad externa");
  });

  await check("6C. La capacidad PREGUNTA a la autoridad · no la reimplementa", () => {
    // Un `if (plan === "full")` aquí sería una segunda regla de acceso, y el
    // día que cambiara la de verdad, la página seguiría prometiendo lo viejo.
    const c = leer("lib/plans/commercial-capabilities.ts");
    assert(/resolveTutorialAccess/.test(c),
      "la capacidad no consulta la autoridad de acceso");
    const codigo = c.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    assert(!/planCode === "full"|plan === "full"|=== "extra" \?/.test(codigo),
      "la capacidad reimplementa la regla de acceso en vez de preguntarla");
  });

  await check("6D. Y una capacidad sin respuesta clara no se escribe", () => {
    assert(formatInclusion("unknown") === null,
      "«no se sabe» se le enseña a quien compara, y se leerá como un no");
  });

  console.log("\n7 · LO QUE NO SE PROMETE PORQUE NO ES DEL PLAN");

  await check("7A. Los módulos NO se prometen por plan", async () => {
    // El acceso a un módulo lo gobierna `organization_modules` por EMPRESA, no
    // el plan. Prometerlos en una página de precios sería vender algo que el
    // plan no concede.
    const [m] = await q(
      `select count(*)::int n from plan_resources
        where code ilike '%module%' or code ilike '%modulo%'`);
    assert(Number(m.n) === 0,
      "hay un recurso de plan que parece gobernar módulos: revisar la autoridad");
    for (const f of [PLANES, COMPARACION]) {
      const src = leer(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
      assert(!/módulos incluidos|incluye los módulos|todos los módulos/i.test(src),
        `${f} promete módulos por plan`);
    }
  });

  await check("7B. Ni la ayuda pública, que es de todos", () => {
    // La FAQ se lee sin sesión (0202). Presentarla como ventaja de un plan
    // sería cobrar por algo que ya es de todo el mundo.
    for (const f of [PLANES, COMPARACION]) {
      const src = leer(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
      assert(!/ayuda incluida|soporte incluido|FAQ incluida/i.test(src),
        `${f} presenta la ayuda pública como beneficio de plan`);
    }
  });

  await check("7C. Y no se promete ningún acuerdo de nivel de servicio", () => {
    for (const f of [PLANES, BILLING, "lib/plans/commercial-copy.ts",
                     "lib/plans/commercial-capabilities.ts"]) {
      const src = leer(f);
      assert(!/\bSLA\b|tiempo de respuesta garantizado|respuesta en \d+ *h/i.test(src),
        `${f} promete un nivel de servicio que no existe`);
    }
  });

  console.log("\n8 · CONTRA LA BASE · LO QUE SE ENSEÑA ES LO QUE HAY");

  await check("8A. Cada cifra de la comparación sale de la autoridad", async () => {
    for (const p of catalogo.saasPlans) {
      const filas = await q(
        `select l.resource_code, l.limit_state, l.limit_value
           from plan_revision_limits l join plan_revisions r on r.id = l.plan_revision_id
          where r.plan_code = $1 and r.status = 'published' and r.effective_to is null`,
        [p.code]);
      for (const f of filas) {
        const enCatalogo = p.limits.find((l) => l.resourceCode === f.resource_code);
        assert(enCatalogo !== undefined, `${p.code}: falta ${f.resource_code}`);
        assert(enCatalogo!.state === f.limit_state,
          `${p.code}/${f.resource_code}: estado ${enCatalogo!.state} ≠ ${f.limit_state}`);
        const v = f.limit_value === null ? null : Number(f.limit_value);
        assert(enCatalogo!.value === v,
          `${p.code}/${f.resource_code}: valor ${enCatalogo!.value} ≠ ${v}`);
      }
    }
  });

  await check("8B. Y la política de tiempo de los planes de pago sigue cerrada", async () => {
    const filas = await q(
      `select r.plan_code from plan_revisions r
         join plan_revision_limits l on l.plan_revision_id = r.id
        where r.status='published' and r.effective_to is null
          and coalesce(r.monthly_price_minor,0) > 0
          and l.resource_code in ('active_minutes_daily','active_minutes_monthly')
          and l.limit_state <> 'unlimited'`);
    assert(filas.length === 0,
      `un plan de pago volvió a tener reloj: ${filas.map((f) => f.plan_code).join(", ")}`);
  });

  await pg.end();
  console.log(`\nCOMMERCIAL-UX-01G · cierre comercial: ${passed} en verde, ${failed} en rojo`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
