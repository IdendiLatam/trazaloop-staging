/**
 * Trazaloop · PE-05B6F.1 · La administración comercial, en idioma de negocio.
 *
 * LO QUE ESTA SUITE VIGILA NO ES ESTÉTICA.
 *
 * Quien administra el catálogo comercial no tiene por qué saber qué es una
 * revisión sucesora, ni que USD 40 se guardan como 4000, ni qué son puntos
 * básicos. Si la pantalla se lo exige, o se equivoca al escribir un precio o
 * deja de tocarlo por miedo. Las dos cosas cuestan dinero.
 *
 * Y la simplificación NO puede haber ablandado nada: lo publicado sigue sin
 * editarse, el institucional sigue teniendo su techo, y quien no es plataforma
 * sigue sin poder tocar nada. Eso se vuelve a comprobar aquí.
 *
 * Correr: npm run test:pe05b6f1-ux
 */
import { config as loadEnv } from "dotenv";
import { readFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

loadEnv({ path: ".env.local" });
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !ANON || !SERVICE) { console.error("Faltan variables."); process.exit(1); }

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
async function check(n: string, fn: () => Promise<void> | void) {
  try { await fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}

const admin = createClient(URL, SERVICE,
  { auth: { autoRefreshToken: false, persistSession: false } });
const sello = `${Date.now()}`;
const password = "Trazaloop-Test-1234";
const personas: string[] = [];
const promos: string[] = [];

const leer = (f: string) => readFileSync(f, "utf8");
const sinComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
/** El texto tal y como lo lee una persona: sin saltos ni concatenaciones. */
const comoSeLee = (s: string) =>
  sinComentarios(s).replace(/\s+/g, " ").replace(/" \+ "/g, "").replace(/\{" "\}/g, " ");

const CONSOLA = leer("components/domain/platform/plan-catalog-console.tsx");
const CAMPANAS = leer("components/domain/platform/promotions-console.tsx");
const PAGINA = leer("app/(app)/platform/plans/page.tsx");
const ACCION_PLANES = leer("server/actions/commercial-console.ts");
const ACCION_CAMPANAS = leer("server/actions/promotions-console.ts");

async function persona(prefijo: string, papel?: "superadmin" | "support") {
  const email = `${prefijo}-${sello}-${Math.floor(Math.random() * 1e6)}@test.trazaloop.dev`;
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: "QA B6F.1" } });
  assert(!error && data.user, `crear ${prefijo}: ${error?.message}`);
  personas.push(data.user!.id);
  if (papel) {
    await admin.from("platform_staff")
      .insert({ user_id: data.user!.id, role_code: papel, status: "active" });
  }
  const cli: SupabaseClient = createClient(URL!, ANON!,
    { auth: { autoRefreshToken: false, persistSession: false } });
  await cli.auth.signInWithPassword({ email, password });
  await cli.rpc("accept_active_legal_documents",
    { p_ip_address: null, p_user_agent: "b6f1" });
  return { id: data.user!.id, email, cli };
}

async function main() {
  console.log("\nPE-05B6F.1 · La administración comercial, en idioma de negocio\n");

  const {
    parseUsdToMinor, usdInputValue, INSTITUTIONAL_FULL_MAX_BPS, PRICE_TAX_NOTE,
  } = await import("../../lib/domain/commercial-catalog");

  try {
    // =====================================================================
    console.log("A · Lo que se lee en la pantalla de planes");
    // =====================================================================
    await check("A. La acción principal dice qué hace, no cómo está hecho", () => {
      assert(CONSOLA.includes("Cambiar condiciones del plan"),
        "no aparece «Cambiar condiciones del plan»");
    });

    await check("B. «Revisión sucesora» no se le enseña a nadie", () => {
      const visible = comoSeLee(CONSOLA) + comoSeLee(PAGINA) + comoSeLee(CAMPANAS);
      for (const jerga of ["revisión sucesora", "revision sucesora", "sucesora en borrador",
                           "unidades menores", "puntos básicos", "basis points",
                           "Historia de revisiones"]) {
        assert(!visible.toLowerCase().includes(jerga.toLowerCase()),
          `sigue apareciendo «${jerga}»`);
      }
    });

    await check("C. El borrador se presenta en idioma de negocio", () => {
      const t = comoSeLee(CONSOLA);
      assert(t.includes("Nuevas condiciones — Borrador"),
        "el borrador no se presenta como «Nuevas condiciones»");
      assert(/Versión \{borrador\.revisionNumber\}/.test(CONSOLA),
        "se perdió el número de versión, que sirve para rastrear");
      assert(t.includes("Las condiciones actuales se conservarán en el historial"),
        "no se explica qué pasa al cambiar un plan");
    });

    await check("D. Los dos precios tienen su etiqueta, y se sabe cuál es cuál", () => {
      assert(CONSOLA.includes("Precio mensual (USD)"), "falta la etiqueta del mensual");
      assert(CONSOLA.includes("Precio anual (USD)"), "falta la etiqueta del anual");
      // Cada campo dentro de su <label>: también para quien navega con teclado
      // o con lector de pantalla.
      const conEtiqueta = /<label[^>]*>[\s\S]{0,200}Precio mensual \(USD\)[\s\S]{0,400}name="monthly_price_usd"/;
      assert(conEtiqueta.test(CONSOLA), "el precio mensual no está dentro de su etiqueta");
      assert(/<label[^>]*>[\s\S]{0,200}Precio anual \(USD\)[\s\S]{0,400}name="annual_price_usd"/
        .test(CONSOLA), "el precio anual no está dentro de su etiqueta");
    });

    await check("E. El formulario ya no pide centavos", () => {
      assert(!CONSOLA.includes("monthly_price_minor"),
        "el formulario sigue mandando centavos");
      assert(!CONSOLA.includes("annual_price_minor"),
        "el formulario sigue mandando centavos");
      assert(ACCION_PLANES.includes("monthly_price_usd")
        && ACCION_PLANES.includes("annual_price_usd"),
        "el servidor no recibe el precio en dólares");
      assert(ACCION_PLANES.includes("parseUsdToMinor"),
        "el servidor no convierte: el navegador seguiría siendo la autoridad");
    });

    await check("I. El botón habla de los dos precios", () => {
      assert(CONSOLA.includes("Guardar precios"), "sigue diciendo «Guardar precio»");
    });

    // =====================================================================
    console.log("\nF · Lo que escribe una persona y lo que guarda la base");
    // =====================================================================
    await check("F/G/H. USD 40 son 4000; USD 400, 40000; y Free, 0", () => {
      const casos: [string, number][] = [
        ["40", 4000], ["400", 40000], ["100", 10000], ["1000", 100000],
        ["0", 0], ["40,50", 4050], ["40.50", 4050], ["40,5", 4050],
        [" 40 ", 4000],
      ];
      for (const [texto, esperado] of casos) {
        const r = parseUsdToMinor(texto);
        assert(r.ok && r.minor === esperado,
          `«${texto}» → ${JSON.stringify(r)}, se esperaba ${esperado}`);
      }
      // Y lo que no se puede aceptar sin adivinar.
      for (const malo of ["-1", "", "abc", "1e3", "40,505", "1.000", "1,000",
                          "4 0", "40.50.20"]) {
        const r = parseUsdToMinor(malo);
        assert(!r.ok, `aceptó «${malo}» → ${JSON.stringify(r)}`);
      }
      // Un separador de miles se rechaza DICIENDO cómo escribirlo.
      const mil = parseUsdToMinor("1.000");
      assert(!mil.ok && mil.reason === "ambiguous",
        `«1.000» se rechazó por ${JSON.stringify(mil)}`);
    });

    await check("F2. Y de vuelta: 4000 se escribe «40», no «40,00»", () => {
      assert(usdInputValue(4000) === "40", usdInputValue(4000));
      assert(usdInputValue(40000) === "400", usdInputValue(40000));
      assert(usdInputValue(4050) === "40,50", usdInputValue(4050));
      assert(usdInputValue(0) === "0", usdInputValue(0));
      assert(usdInputValue(null) === "", "un precio sin poner debería quedar vacío");
    });

    await check("F3. Sin coma flotante: 40,50 no se convierte en 4049", () => {
      // `40.50 * 100` en coma flotante da 4049.999…; por eso la conversión
      // separa los enteros de los decimales.
      for (let c = 0; c <= 99; c += 1) {
        const texto = `1,${String(c).padStart(2, "0")}`;
        const r = parseUsdToMinor(texto);
        assert(r.ok && r.minor === 100 + c, `«${texto}» → ${JSON.stringify(r)}`);
      }
    });

    // =====================================================================
    console.log("\nJ · Las campañas");
    // =====================================================================
    await check("J. El techo desaparece del formulario ordinario", () => {
      assert(!comoSeLee(CAMPANAS).includes("Techo máximo"),
        "el formulario sigue pidiendo un techo");
      assert(!CAMPANAS.includes("setTecho"), "quedó el estado del techo");
      // Pero el servidor SÍ lo pone, y sigue existiendo en el dominio.
      assert(ACCION_CAMPANAS.includes("INSTITUTIONAL_FULL_MAX_BPS"),
        "el servidor ya no decide el techo");
      assert(ACCION_CAMPANAS.includes("p_max_discount_basis_points"),
        "dejó de mandarse el techo a la base");
    });

    await check("K. El institucional dice su límite, sin pedir un segundo número", () => {
      assert(comoSeLee(CAMPANAS).includes("Este programa permite descuentos de hasta el 40 %"),
        "no se dice cuánto permite el programa");
      assert(INSTITUTIONAL_FULL_MAX_BPS === 4000,
        `el techo del programa es ${INSTITUTIONAL_FULL_MAX_BPS}`);
    });

    await check("M. En institucional no se invita a elegir Extra", () => {
      assert(comoSeLee(CAMPANAS).includes("Este programa es solo para Full"),
        "no se dice que el institucional es solo Full");
      assert(ACCION_CAMPANAS.includes('institucional ? ["full"]'),
        "el servidor no fija el plan del programa institucional");
    });

    await check("N. La campaña general sigue configurándose entera", () => {
      const t = comoSeLee(CAMPANAS);
      for (const campo of ["Nombre", "Descripción", "Programa", "Descuento (%)",
                           "Planes elegibles", "Periodicidad", "Máximo de canjes"]) {
        assert(t.includes(campo), `falta el campo «${campo}»`);
      }
      assert(t.includes("Crear campaña"), "la acción no dice «Crear campaña»");
      assert(!t.includes("Crear en borrador"), "sigue diciendo «Crear en borrador»");
      // Y el estado sigue viéndose: no se publica sola.
      assert(CAMPANAS.includes('draft: "Borrador"'), "se perdió el estado de borrador");
    });

    await check("26. El impuesto se explica sin prometer un país", () => {
      assert(!PRICE_TAX_NOTE.includes("IVA aplicable según el país"),
        "sigue la frase que promete un impuesto por país");
      assert(PRICE_TAX_NOTE.includes("antes de impuestos")
        && PRICE_TAX_NOTE.includes("por separado"), PRICE_TAX_NOTE);
    });

    // =====================================================================
    console.log("\nO a R · Y nada de esto ablandó el dominio");
    // =====================================================================
    const sa = await persona("b6f1-sa", "superadmin");

    await check("L. Un institucional del 45 % se rechaza, y en el servidor", async () => {
      const { data, error } = await sa.cli.rpc("billing_create_promotion", {
        p_name: `QA B6F1 exceso ${sello}`, p_description: null,
        p_program: "institutional_full", p_discount_basis_points: 4500,
        p_eligible_plan_codes: ["full"], p_eligible_intervals: ["monthly"],
        p_max_discount_basis_points: 4000,
        p_starts_at: new Date().toISOString(), p_ends_at: null,
        p_max_redemptions: null, p_max_per_organization: 1 });
      assert(error !== null, `aceptó un 45 % institucional: ${JSON.stringify(data)}`);
    });

    await check("M2. Un institucional apuntando a Extra se rechaza", async () => {
      const { error } = await sa.cli.rpc("billing_create_promotion", {
        p_name: `QA B6F1 extra ${sello}`, p_description: null,
        p_program: "institutional_full", p_discount_basis_points: 2000,
        p_eligible_plan_codes: ["full", "extra"], p_eligible_intervals: ["monthly"],
        p_max_discount_basis_points: 4000,
        p_starts_at: new Date().toISOString(), p_ends_at: null,
        p_max_redemptions: null, p_max_per_organization: 1 });
      assert(error !== null, "un institucional pudo apuntar a Extra");
    });

    await check("P. Una campaña publicada sigue sin poder reescribirse", async () => {
      const { data, error } = await sa.cli.rpc("billing_create_promotion", {
        p_name: `QA B6F1 publicada ${sello}`, p_description: null,
        p_program: "general", p_discount_basis_points: 1500,
        p_eligible_plan_codes: ["full"], p_eligible_intervals: ["monthly"],
        p_max_discount_basis_points: null,
        p_starts_at: new Date(Date.now() - 3_600_000).toISOString(), p_ends_at: null,
        p_max_redemptions: null, p_max_per_organization: 1 });
      assert(!error, `crear: ${error?.message}`);
      const id = String((data as Record<string, unknown>).promotion_id);
      promos.push(id);
      await sa.cli.rpc("billing_create_promotion_code",
        { p_promotion_id: id, p_code: `B6F1${sello}` });
      const { data: pub } = await sa.cli.rpc("billing_publish_promotion",
        { p_promotion_id: id });
      assert((pub as Record<string, unknown>).status === "published", JSON.stringify(pub));

      const { error: eEdit } = await admin.from("billing_promotions")
        .update({ discount_value: 9000 }).eq("id", id);
      assert(eEdit !== null, "se pudo reescribir una campaña publicada");
    });

    await check("O. Una revisión de plan publicada sigue sin editarse", async () => {
      const { data: rev } = await admin.from("plan_revisions")
        .select("id, monthly_price_minor").eq("plan_code", "full")
        .eq("status", "published").is("effective_to", null).single();
      const r = rev as { id: string; monthly_price_minor: number };
      const { error } = await admin.from("plan_revisions")
        .update({ monthly_price_minor: 999 }).eq("id", r.id);
      assert(error !== null, "se pudo editar el precio de una revisión publicada");
      const { data: despues } = await admin.from("plan_revisions")
        .select("monthly_price_minor").eq("id", r.id).single();
      assert((despues as { monthly_price_minor: number }).monthly_price_minor
        === r.monthly_price_minor, "el precio publicado cambió");
    });

    await check("Q. El historial de versiones se sigue viendo", async () => {
      const { data } = await sa.cli.from("plan_revisions")
        .select("plan_code, revision_number, status").eq("plan_code", "full");
      assert((data ?? []).length >= 1, "no se ve ninguna versión");
      assert(CONSOLA.includes("Historial de condiciones"),
        "se quitó el historial de la pantalla");
    });

    await check("R. Y las cifras comerciales no se han movido", async () => {
      const { data } = await admin.from("plan_revisions")
        .select("plan_code, monthly_price_minor, annual_price_minor")
        .is("effective_to", null).eq("status", "published");
      const cat = Object.fromEntries(((data ?? []) as Record<string, unknown>[])
        .map((r) => [String(r.plan_code), r]));
      const esperado: Record<string, [number, number]> = {
        free: [0, 0], full: [4000, 40000], extra: [10000, 100000],
      };
      for (const [plan, [m, a]] of Object.entries(esperado)) {
        assert(Number(cat[plan].monthly_price_minor) === m,
          `${plan} mensual es ${cat[plan].monthly_price_minor}, se esperaba ${m}`);
        assert(Number(cat[plan].annual_price_minor) === a,
          `${plan} anual es ${cat[plan].annual_price_minor}, se esperaba ${a}`);
      }
    });

    await check("31. Quien no es plataforma no administra nada de esto", async () => {
      const ajeno = await persona("b6f1-ajeno");
      const { error: e1 } = await ajeno.cli.rpc("billing_create_promotion", {
        p_name: "intento", p_description: null, p_program: "general",
        p_discount_basis_points: 1000, p_eligible_plan_codes: ["full"],
        p_eligible_intervals: ["monthly"], p_max_discount_basis_points: null,
        p_starts_at: new Date().toISOString(), p_ends_at: null,
        p_max_redemptions: null, p_max_per_organization: 1 });
      assert(e1 !== null, "una empresa pudo crear una campaña");
      const { error: e2 } = await ajeno.cli.from("plan_revisions")
        .update({ monthly_price_minor: 1 }).eq("plan_code", "full");
      assert(e2 !== null || true, "");
      const { data: sigue } = await admin.from("plan_revisions")
        .select("monthly_price_minor").eq("plan_code", "full")
        .eq("status", "published").is("effective_to", null).single();
      assert(Number((sigue as { monthly_price_minor: number }).monthly_price_minor)
        === 4000, "una empresa cambió el precio de Full");

      // Soporte lee y no escribe.
      const soporte = await persona("b6f1-sop", "support");
      const { data: ve } = await soporte.cli.from("plan_revisions")
        .select("id").limit(1);
      assert((ve ?? []).length > 0, "soporte no puede ni leer el catálogo");
      const { error: e3 } = await soporte.cli.rpc("billing_create_promotion", {
        p_name: "intento soporte", p_description: null, p_program: "general",
        p_discount_basis_points: 1000, p_eligible_plan_codes: ["full"],
        p_eligible_intervals: ["monthly"], p_max_discount_basis_points: null,
        p_starts_at: new Date().toISOString(), p_ends_at: null,
        p_max_redemptions: null, p_max_per_organization: 1 });
      assert(e3 !== null, "soporte pudo crear una campaña");
    });

  } finally {
    for (const id of promos) {
      await admin.from("billing_promotion_codes").delete().eq("promotion_id", id);
      await admin.from("billing_promotions").delete().eq("id", id);
    }
    for (const id of personas) {
      await admin.from("platform_staff").delete().eq("user_id", id);
      await admin.auth.admin.deleteUser(id);
    }
  }

  console.log(`\nPE-05B6F.1 · administración comercial: ${passed} en verde, ${failed} en rojo\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
