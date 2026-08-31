/**
 * Trazaloop · PE-01B · La puerta, recorrida por HTTP · P1…P8.
 *
 * Contra el BUILD DE PRODUCCIÓN, con sesión real y RLS real. Lo que se
 * comprueba aquí no lo puede comprobar ninguna prueba de componente: que nadie
 * es empujado dentro de un módulo, que la puerta abre para todas las formas de
 * empresa —una, varias, ninguna—, y que ningún enlace de la puerta lleva a un
 * 404.
 *
 * Requisitos: `npm run build` previo y Supabase local en marcha.
 * Correr: npm run test:pe01-modules-e2e
 */
import { config as loadEnv } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHmac } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";

loadEnv({ path: ".env.local" });

const URL_SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ORG_SECRET = process.env.ACTIVE_ORG_COOKIE_SECRET ?? null;
if (!URL_SB || !ANON || !SERVICE) {
  console.error("Faltan variables para test:pe01-modules-e2e."); process.exit(1);
}

const PORT = Number(process.env.PE01_PORT ?? 3191);
const BASE = `http://localhost:${PORT}`;
const AUTH_COOKIE = `sb-${new global.URL(URL_SB).hostname.split(".")[0]}-auth-token`;

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
async function check(n: string, fn: () => Promise<void>) {
  try { await fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}

const admin = createClient(URL_SB, SERVICE,
  { auth: { autoRefreshToken: false, persistSession: false } });
const servers: ChildProcess[] = [];
function stopServers() {
  for (const p of servers) { try { p.kill("SIGTERM"); } catch { /* ya terminado */ } }
}
async function waitUp() {
  const limite = Date.now() + 120_000;
  while (Date.now() < limite) {
    try { const r = await fetch(`${BASE}/`, { redirect: "manual" }); if (r.status > 0) return; }
    catch { /* aún no */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("el servidor no arrancó");
}

function flat(html: string): string {
  return html.replace(/<script\b[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"')
    .replace(/&#x2F;/g, "/").replace(/&middot;/g, "·").replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ");
}
const has = (html: string, s: string) => flat(html).toLowerCase().includes(s.toLowerCase());
function links(html: string): { href: string; text: string }[] {
  return [...html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)]
    .map((m) => ({ href: m[1].replace(/&amp;/g, "&"), text: flat(m[2]).trim() }));
}

const CODES = { quality: "quality", cpr: "traceability_6632", textiles: "textiles" } as const;
const password = "Trazaloop-Test-1234";

async function main() {
  console.log("\nPE-01B · La puerta por HTTP · P1…P8\n");
  console.log("  · levantando el build de producción…");
  servers.push(spawn("npx", ["next", "start", "-p", String(PORT)], {
    env: { ...process.env, QUALITY_MODULE_ENABLED: "true" }, stdio: "ignore",
  }));
  await waitUp();

  const sello = Date.now();

  /** Una persona, su empresa, y exactamente los módulos que se le digan. */
  async function escenario(
    tag: string,
    modulos: Partial<Record<keyof typeof CODES, "demo" | "full" | "extra">>
  ) {
    const email = `pe01-e2e-${tag}-${sello}@test.trazaloop.dev`;
    const { data: creado } = await admin.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { full_name: `QA PE-01 ${tag}` } });
    assert(creado.user, `crear persona ${tag}`);
    const cli: SupabaseClient = createClient(URL_SB!, ANON!,
      { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: sesion } = await cli.auth.signInWithPassword({ email, password });
    assert(sesion.session, `login ${tag}`);
    await cli.rpc("accept_active_legal_documents", { p_ip_address: null, p_user_agent: "pe01" });
    const { data: orgId } = await cli.rpc("create_organization",
      { p_name: `QA PE-01 · ${tag} ${sello}` });
    const org = orgId as string;
    await admin.from("organization_modules").update({ enabled: false }).eq("organization_id", org);
    for (const [k, modo] of Object.entries(modulos)) {
      await admin.from("organization_modules")
        .update({ enabled: true, access_mode: modo, access_expires_at: null })
        .eq("organization_id", org).eq("module_code", CODES[k as keyof typeof CODES]);
    }
    const b64 = Buffer.from(JSON.stringify(sesion.session), "utf8").toString("base64url");
    const firma = ORG_SECRET
      ? `.${createHmac("sha256", ORG_SECRET).update(org).digest("base64url")}` : "";
    const cookie = `${AUTH_COOKIE}=base64-${b64}; tz-active-org=${org}${firma}`;
    const get = async (path: string) => {
      const r = await fetch(`${BASE}${path}`, { headers: { cookie }, redirect: "manual" });
      return { status: r.status, location: r.headers.get("location"),
               body: r.status === 200 ? await r.text() : "" };
    };
    return { org, cookie, get };
  }

  const soloQuality = await escenario("solo-quality", { quality: "full" });
  const varios = await escenario("varios", { quality: "full", cpr: "full" });
  const sinNada = await escenario("sin-modulos", {});

  // =========================================================================
  // P1 · Nadie es empujado dentro de un módulo
  // =========================================================================
  let puerta = "";
  await check("P1.1 · Con UN solo módulo, la puerta abre igual", async () => {
    const r = await soloQuality.get("/modules");
    assert(r.status === 200, `/modules dio ${r.status} → ${r.location ?? "—"}`);
    puerta = r.body;
    assert(!has(puerta, "redirigiendo"), "la puerta se anuncia como un paso intermedio");
  });

  await check("P1.2 · Y con varios, también: la puerta no elige por ti", async () => {
    const r = await varios.get("/modules");
    assert(r.status === 200, `/modules dio ${r.status} → ${r.location ?? "—"}`);
  });

  await check("P1.3 · Después de entrar y volver, sigue abriendo la puerta", async () => {
    // Lo contrario sería recordar el último módulo, que es exactamente lo
    // que esta versión decidió NO hacer.
    await soloQuality.get("/quality");
    const r = await soloQuality.get("/modules");
    assert(r.status === 200, `la puerta dio ${r.status} → ${r.location ?? "—"}`);
    assert(has(r.body, "Trazaloop Quality"), "la puerta dejó de enseñar los módulos");
  });

  // =========================================================================
  // P2 · Lo que la puerta enseña, y lo que NO vende
  // =========================================================================
  await check("P2.1 · Quality es el protagonista, con su frase", async () => {
    assert(has(puerta, "Trazaloop Quality"), "no está el protagonista");
    assert(has(puerta, "Gestiona procesos, riesgos, objetivos, personas, proveedores"),
      "no está la frase acordada");
    assert(!has(puerta, "trazabilidad de cada decisión"),
      "vuelve la frase que se retiró");
    for (const p of ["certifica", "conformidad con la ISO", "ISO 9001"]) {
      assert(!has(puerta, p), `la puerta promete «${p}»`);
    }
  });

  await check("P2.2 · Los tres especializados están, en su orden", async () => {
    for (const n of ["Trazaloop PCR", "Trazaloop Textiles", "Trazaloop Construcción"]) {
      assert(has(puerta, n), `falta ${n}`);
    }
    const plano = flat(puerta);
    const pos = ["Trazaloop Quality", "Trazaloop PCR", "Trazaloop Textiles",
      "Trazaloop Construcción"].map((n) => plano.indexOf(n));
    assert(pos.every((p, i) => i === 0 || p > pos[i - 1]),
      `el orden de la puerta cambió: ${pos.join(", ")}`);
  });

  await check("P2.3 · No hay NADA comercial: ni planes, ni precios, ni checkout", async () => {
    for (const p of ["Ver planes", "Contratar", "Solicitar presupuesto", "Comprar",
      "Precio", "€/mes", "Suscríbete", "Hablar con ventas", "Mejora tu plan",
      "Actualizar plan", "Pedir una demo"]) {
      assert(!has(puerta, p), `la puerta vende: «${p}»`);
    }
    for (const l of links(puerta)) {
      assert(!/pricing|planes|checkout|billing|upgrade/i.test(l.href),
        `hay un enlace comercial: ${l.href}`);
    }
  });

  // =========================================================================
  // P3 · Entrar
  // =========================================================================
  await check("P3.1 · «Entrar a Quality» lleva a Quality", async () => {
    const entrada = links(puerta).find((l) => l.text.includes("Entrar a Quality"));
    assert(entrada, "la puerta no ofrece entrar a Quality");
    assert(entrada!.href === "/quality", `lleva a ${entrada!.href}`);
    const r = await soloQuality.get(entrada!.href);
    assert(r.status === 200, `Quality dio ${r.status} → ${r.location ?? "—"}`);
    assert(has(r.body, "Quality"), "la portada de Quality no se reconoce");
  });

  await check("P3.2 · Dentro se sabe en qué módulo se está, y cómo salir", async () => {
    const r = await soloQuality.get("/quality");
    assert(has(r.body, "Ver módulos"), "dentro del módulo no hay forma de volver a la puerta");
    const volver = links(r.body).find((l) => l.href === "/modules");
    assert(volver, "no hay enlace a la puerta");
  });

  // =========================================================================
  // P4 · Volver, sin bucle
  // =========================================================================
  await check("P4.1 · Volver a la puerta desde dentro no rebota", async () => {
    const r = await soloQuality.get("/modules");
    assert(r.status === 200, `la puerta dio ${r.status} → ${r.location ?? "—"}`);
  });

  // =========================================================================
  // P5 · Lo que no se tiene: se ve, no se ofrece, y no se vende
  // =========================================================================
  await check("P5.1 · Un módulo sin acceso NO es un enlace", async () => {
    const destinos = links(puerta).map((l) => l.href);
    assert(!destinos.includes("/dashboard"), "se ofrece entrar a PCR sin tenerlo");
    assert(!destinos.includes("/textiles"), "se ofrece entrar a Textiles sin tenerlo");
    assert(has(puerta, "No incluido") || has(puerta, "Acceso suspendido"),
      "no se dice en qué situación está lo que no se tiene");
  });

  await check("P5.2 · Y aunque se escriba la URL a mano, el guardián sigue ahí", async () => {
    const r = await soloQuality.get("/dashboard");
    assert(r.status !== 200 || !has(r.body, "Panel de control"),
      "se entró a PCR sin tenerlo contratado");
  });

  await check("P5.3 · Construcción se anuncia como futuro, sin lista de espera", async () => {
    assert(has(puerta, "Próximamente"), "el módulo futuro no se anuncia");
    assert(!has(puerta, "Avísame") && !has(puerta, "Lista de espera")
      && !has(puerta, "Apúntate"), "el módulo futuro capta interés comercial");
  });

  // =========================================================================
  // P6 · Una empresa sin módulos activos
  // =========================================================================
  await check("P6.1 · Se queda en la puerta, y se le explica", async () => {
    const r = await sinNada.get("/modules");
    assert(r.status === 200, `la puerta dio ${r.status} → ${r.location ?? "—"}`);
    assert(has(r.body, "no tiene módulos activos"), "no se explica la situación");
    assert(has(r.body, "tus datos se conservan"), "no se tranquiliza sobre los datos");
  });

  await check("P6.2 · No es un error, ni un bucle, ni una venta", async () => {
    const r = await sinNada.get("/modules");
    for (const p of ["Algo salió mal", "Error 500", "Se ha producido un error",
      "Ver planes", "Contratar", "Hablar con ventas"]) {
      assert(!has(r.body, p), `se muestra «${p}»`);
    }
    // Tres visitas seguidas: siempre 200, nunca un rebote.
    for (let i = 0; i < 3; i += 1) {
      const x = await sinNada.get("/modules");
      assert(x.status === 200, `la visita ${i + 1} dio ${x.status} → ${x.location ?? "—"}`);
    }
  });

  await check("P6.3 · Y sigue pudiendo hacer lo transversal: cuenta, empresa, soporte",
    async () => {
      for (const ruta of ["/settings/profile", "/settings/company", "/support", "/team"]) {
        const r = await sinNada.get(ruta);
        assert(r.status === 200 || r.status === 307,
          `${ruta} dio ${r.status} para una empresa sin módulos`);
      }
    });

  // =========================================================================
  // P7 · Cambiar de empresa
  // =========================================================================
  await check("P7.1 · Desde la puerta se puede cambiar de empresa", async () => {
    const cambiar = links(puerta).find((l) => l.text.includes("cambiar empresa"));
    assert(cambiar, "la puerta no deja cambiar de empresa");
    const r = await soloQuality.get(cambiar!.href);
    assert(r.status === 200 || r.status === 307,
      `cambiar de empresa dio ${r.status} → ${r.location ?? "—"}`);
  });

  await check("P7.2 · Y la puerta dice de qué empresa habla", async () => {
    assert(has(puerta, `QA PE-01 · solo-quality ${sello}`),
      "la puerta no nombra la empresa activa");
  });

  // =========================================================================
  // P8 · Ningún enlace de la puerta lleva a la nada
  // =========================================================================
  await check("P8.1 · Todos los enlaces de la puerta responden", async () => {
    const internos = [...new Set(links(puerta).map((l) => l.href))]
      .filter((h) => h.startsWith("/"));
    // Con un solo módulo entrable son pocos —entrar y cambiar de empresa—, y
    // esa escasez es la señal de que la puerta no ofrece lo que no se tiene.
    assert(internos.length >= 2, `solo hay ${internos.length} enlaces internos`);
    for (const href of internos) {
      const r = await soloQuality.get(href);
      assert(r.status !== 404, `${href} da 404`);
      assert(r.status !== 500, `${href} da 500`);
    }
  });

  await check("P8.2 · Y los de la empresa sin módulos, también", async () => {
    const r = await sinNada.get("/modules");
    for (const href of [...new Set(links(r.body).map((l) => l.href))]
      .filter((h) => h.startsWith("/"))) {
      const x = await sinNada.get(href);
      assert(x.status !== 404, `${href} da 404`);
      assert(x.status !== 500, `${href} da 500`);
    }
  });

  // =========================================================================
  // Regresiones · PE-D3 y la portada pública
  // =========================================================================
  await check("R1 · Las rutas transversales ya no dependen del repuesto de PCR",
    async () => {
      // PE-D3: el shell resolvía CUALQUIER ruta desconocida como si fuera PCR.
      // Al quitar ese repuesto, una ruta transversal mal declarada se queda sin
      // marco: por eso se abren de verdad.
      for (const ruta of ["/settings/profile", "/settings/company", "/support",
        "/team", "/onboarding"]) {
        const r = await varios.get(ruta);
        assert(r.status !== 404 && r.status !== 500,
          `${ruta} dio ${r.status} tras quitar el módulo por defecto`);
      }
    });

  await check("R2 · La portada pública ya no dice que Quality está por llegar", async () => {
    const r = await fetch(`${BASE}/`, { redirect: "manual" });
    const html = await r.text();
    assert(has(html, "Gestiona procesos, riesgos, objetivos"),
      "la portada no lleva la frase acordada de Quality");
    for (const p of ["Quality · Próximamente", "Quality (próximamente)", "Muy pronto"]) {
      assert(!has(html, p), `la portada sigue diciendo «${p}»`);
    }
  });

  stopServers();
  console.log(`\nPE-01B · puerta (HTTP): ${passed} en verde, ${failed} en rojo\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); stopServers(); process.exit(1); });
