/**
 * Trazaloop · PE-01B · El acceso a los módulos, contra base REAL.
 *
 * La matriz A–P de PE-01A: once combinaciones de empresa, y la comprobación que
 * sostiene el tramo —**que un fallo de lectura no se presenta como una decisión
 * comercial**—.
 *
 * Correr: npm run test:pe01-modules-access
 */
import { config as loadEnv } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

loadEnv({ path: ".env.local" });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !ANON || !SERVICE) { console.error("Faltan variables."); process.exit(1); }

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
async function check(n: string, fn: () => Promise<void>) {
  try { await fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}

const admin = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });
const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const password = "Trazaloop-Test-1234";

const CODES = {
  quality: "quality", cpr: "traceability_6632", textiles: "textiles",
} as const;

async function persona(tag: string) {
  const email = `pe01-${tag}-${stamp}@test.trazaloop.dev`;
  const { data } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: `QA PE-01 ${tag}` } });
  assert(data.user, `usuario ${tag}`);
  const cli: SupabaseClient = createClient(URL!, ANON!, {
    auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await cli.auth.signInWithPassword({ email, password });
  assert(!error, `login ${tag}: ${error?.message}`);
  return cli;
}

async function main() {
  const ACCESO = await import("../../lib/db/module-access");
  const { isEnterableState } = await import("../../lib/modules/messages");
  const { overviewOf } = await import("../../lib/modules/entry");

  console.log("\nPE-01B · Acceso a los módulos · base real\n");

  /**
   * Una empresa de QA con exactamente los módulos que se le digan.
   *
   * Se REUTILIZA el patrón del repositorio —crear empresa y actualizar
   * `organization_modules`— en vez de crear fixtures permanentes. Todo con
   * prefijo «QA PE-01 ·» y todo reversible.
   */
  async function empresa(
    tag: string, modulos: Partial<Record<keyof typeof CODES, {
      mode: "demo" | "full" | "extra"; expires?: string | null; enabled?: boolean }>>
  ) {
    const cli = await persona(tag);
    const { data: orgId } = await cli.rpc("create_organization",
      { p_name: `QA PE-01 · ${tag} ${stamp}` });
    const org = orgId as string;
    // El alta deja los tres funcionales en Demo de 48 h: se apagan todos y se
    // enciende solo lo que pida el escenario.
    await admin.from("organization_modules").update({ enabled: false })
      .eq("organization_id", org);
    for (const [k, cfg] of Object.entries(modulos)) {
      const { error } = await admin.from("organization_modules").update({
        enabled: cfg!.enabled ?? true,
        access_mode: cfg!.mode,
        access_expires_at: cfg!.expires ?? null,
      }).eq("organization_id", org).eq("module_code", CODES[k as keyof typeof CODES]);
      assert(!error, `configurar ${k} en ${tag}: ${error?.message}`);
    }
    return { cli, org };
  }

  // El cliente de la persona viaja explícito: estas lecturas se hacen con SU
  // sesión y SU RLS, igual que en la aplicación.
  const estadoDe = async (org: string, cli: SupabaseClient) => {
    const s = await ACCESO.getActiveOrgModuleStatuses(org, cli);
    return new Map(s.map((x) => [x.key, x.access.derivedState]));
  };

  // =========================================================================
  console.log("M · La matriz de empresas");
  // =========================================================================

  const soloQuality = await empresa("solo-quality", { quality: { mode: "full" } });
  const soloPcr = await empresa("solo-pcr", { cpr: { mode: "full" } });
  const soloTextiles = await empresa("solo-textiles", { textiles: { mode: "full" } });
  const qualityPcr = await empresa("quality-pcr",
    { quality: { mode: "full" }, cpr: { mode: "full" } });
  const qualityTextiles = await empresa("quality-textiles",
    { quality: { mode: "full" }, textiles: { mode: "full" } });
  const todo = await empresa("todo",
    { quality: { mode: "full" }, cpr: { mode: "extra" }, textiles: { mode: "demo" } });
  const vencida = await empresa("prueba-vencida", {
    quality: { mode: "full" },
    cpr: { mode: "demo", expires: "2026-01-01T00:00:00Z" },
  });
  const sinNada = await empresa("sin-modulos", {});

  await check("A. Empresa solo con Quality: entra a Quality y a nada más", async () => {
    const e = await estadoDe(soloQuality.org, soloQuality.cli);
    assert(e.get("quality") === "full", `Quality llegó ${e.get("quality")}`);
    assert(!isEnterableState(e.get("cpr")!), "puede entrar a PCR sin tenerlo");
    assert(!isEnterableState(e.get("textiles")!), "puede entrar a Textiles sin tenerlo");
    assert(e.get("construccion") === "coming_soon", "Construcción no es futuro");
  });

  await check("B. Empresa solo con PCR", async () => {
    const e = await estadoDe(soloPcr.org, soloPcr.cli);
    assert(e.get("cpr") === "full", `PCR llegó ${e.get("cpr")}`);
    assert(!isEnterableState(e.get("quality")!), "puede entrar a Quality sin tenerlo");
  });

  await check("C. Empresa solo con Textiles · sin repuesto de PCR", async () => {
    const e = await estadoDe(soloTextiles.org, soloTextiles.cli);
    assert(e.get("textiles") === "full", `Textiles llegó ${e.get("textiles")}`);
    assert(!isEnterableState(e.get("cpr")!), "PCR sirvió de repuesto");
  });

  await check("D. Quality + PCR: los dos entrables", async () => {
    const e = await estadoDe(qualityPcr.org, qualityPcr.cli);
    assert(isEnterableState(e.get("quality")!) && isEnterableState(e.get("cpr")!),
      "no entran los dos");
    assert(!isEnterableState(e.get("textiles")!), "entra a Textiles sin tenerlo");
  });

  await check("E. Quality + Textiles: la pareja sin PCR de por medio", async () => {
    const e = await estadoDe(qualityTextiles.org, qualityTextiles.cli);
    assert(isEnterableState(e.get("quality")!) && isEnterableState(e.get("textiles")!),
      "no entran los dos");
    assert(!isEnterableState(e.get("cpr")!), "PCR entra sin estar contratado");
  });

  await check("F. Todo activo: tres entrables y el futuro fuera", async () => {
    const e = await estadoDe(todo.org, todo.cli);
    assert(e.get("quality") === "full" && e.get("cpr") === "extra", "modos mal resueltos");
    assert(isEnterableState(e.get("textiles")!), "la prueba de Textiles no entra");
    assert(!isEnterableState(e.get("construccion")!), "el módulo futuro entra");
  });

  await check("G. Prueba de PCR vencida + Quality activo", async () => {
    const e = await estadoDe(vencida.org, vencida.cli);
    assert(e.get("cpr") === "demo_expired", `PCR llegó ${e.get("cpr")}`);
    assert(e.get("quality") === "full", "Quality se contagió del vencimiento de PCR");
    const resumen = await ACCESO.getDemoTrialSummary(vencida.org, vencida.cli);
    assert(resumen.notice === "partial",
      `el aviso dice «${resumen.notice}» y debería hablar de una prueba parcial`);
    assert(resumen.expiredModules.some((n) => n.includes("PCR")), "no se nombra el módulo vencido");
    assert(resumen.hasEnterableModule, "una prueba vencida dejó la empresa sin módulos");
  });

  await check("H. Empresa sin ningún módulo activo", async () => {
    const e = await estadoDe(sinNada.org, sinNada.cli);
    const estados = [...e.values()];
    assert(!estados.some((s) => isEnterableState(s)), "hay un módulo entrable");
    const resumen = overviewOf(estados);
    assert(!resumen.hasEnterable, "el resumen dice que hay módulos entrables");
    assert(!resumen.allUnavailable,
      "«sin módulos» se confundió con «no se pudo comprobar»");
    // Y no es un fallo: se leyó todo y la respuesta es que no hay.
    for (const s of estados) {
      assert(s !== "unavailable", "una lectura correcta llegó como fallo");
    }
  });

  await check("I. Un módulo deshabilitado NO se confunde con uno no asignado", async () => {
    const e = await estadoDe(sinNada.org, sinNada.cli);
    assert(e.get("quality") === "disabled",
      `un módulo deshabilitado llegó ${e.get("quality")}`);
  });

  await check("J. Construcción es futuro para todas las empresas", async () => {
    for (const o of [soloQuality, soloPcr, todo, sinNada]) {
      const e = await estadoDe(o.org, o.cli);
      assert(e.get("construccion") === "coming_soon", "Construcción dejó de ser futuro");
    }
  });

  // =========================================================================
  console.log("\nN · Un fallo NO es una decisión comercial · PE-D1");
  // =========================================================================

  await check("P. Un error de lectura llega como «no se pudo», no como «no lo tienes»", async () => {
    // Se rompe la lectura de la tabla de asignaciones. Antes de PE-01B esto
    // devolvía `null` y se resolvía como `not_assigned`: la tarjeta afirmaba
    // que la empresa no tenía el módulo.
    const { resolveModuleAccess } = await import("../../lib/modules/access");
    const roto = resolveModuleAccess({
      isFunctional: true, killSwitchActive: true,
      assignment: null, assignmentUnavailable: true, now: new Date(),
    });
    assert(roto.derivedState === "unavailable", `llegó ${roto.derivedState}`);
    assert(!roto.allowed, "un fallo concedió acceso");

    // Y contra base real: la empresa SÍ tiene Quality, pero si la lectura
    // fallara no puede decirse lo contrario.
    const e = await estadoDe(soloQuality.org, soloQuality.cli);
    assert(e.get("quality") === "full", "el escenario de control cambió");
  });

  await check("P2. La búsqueda distingue las tres respuestas", async () => {
    const hay = await ACCESO.getOrganizationModuleAssignment(
      soloQuality.org, CODES.quality, soloQuality.cli);
    assert(hay.status === "found", `con asignación llegó ${hay.status}`);
    const noHay = await ACCESO.getOrganizationModuleAssignment(
      soloQuality.org, "modulo_que_no_existe", soloQuality.cli);
    assert(noHay.status === "absent", `sin fila llegó ${noHay.status}`);
  });

  await check("P3. Con la lectura ROTA de verdad, la respuesta es «no se pudo»", async () => {
    // No se simula la regla: se rompe el cliente y se recorre el camino
    // completo —búsqueda, resolución, estado— igual que lo recorre la página.
    const roto = new Proxy(soloQuality.cli, {
      get(target, prop) {
        if (prop === "from") {
          return () => ({
            select: () => ({ eq: () => ({ eq: () => ({
              maybeSingle: async () => ({
                data: null, error: { message: "conexión interrumpida" } }),
            }) }) }),
          });
        }
        return Reflect.get(target, prop);
      },
    }) as unknown as SupabaseClient;

    const busqueda = await ACCESO.getOrganizationModuleAssignment(
      soloQuality.org, CODES.quality, roto);
    assert(busqueda.status === "unavailable", `la búsqueda llegó ${busqueda.status}`);

    const decision = await ACCESO.resolveModuleAccessForOrg(
      soloQuality.org, CODES.quality, roto);
    assert(decision.derivedState === "unavailable",
      `una lectura rota se resolvió como «${decision.derivedState}»`);
    assert(!decision.allowed, "una lectura rota concedió acceso");

    const estados = await estadoDe(soloQuality.org, roto);
    assert([...estados.values()].filter((s) => s === "unavailable").length === 3,
      "los tres módulos funcionales deberían llegar como no verificados");
    // Y el resumen lo dice, en vez de decir que la empresa no tiene nada.
    const resumen = overviewOf([...estados.values()]);
    assert(resumen.allUnavailable, "el resumen no distingue avería de ausencia");
    assert(!resumen.hasEnterable, "una lectura rota dejó un módulo entrable");
  });

  await check("P4. Una excepción del cliente se trata igual que un error", async () => {
    const explota = new Proxy(soloQuality.cli, {
      get(target, prop) {
        if (prop === "from") return () => { throw new Error("socket cerrado"); };
        return Reflect.get(target, prop);
      },
    }) as unknown as SupabaseClient;
    const decision = await ACCESO.resolveModuleAccessForOrg(
      soloQuality.org, CODES.quality, explota);
    assert(decision.derivedState === "unavailable",
      `una excepción se resolvió como «${decision.derivedState}»`);
  });

  await check("P5. Lo que la RLS NO puede distinguir, dicho en voz alta", async () => {
    // Una denegación de RLS devuelve CERO FILAS, no un error. Así que leer la
    // empresa de otra persona llega como «no hay», no como «no se pudo».
    const ajena = await ACCESO.getOrganizationModuleAssignment(
      soloPcr.org, CODES.cpr, soloQuality.cli);
    assert(ajena.status === "absent",
      `una denegación de RLS llegó como ${ajena.status}`);
    // No es un agujero: la empresa activa SIEMPRE sale de la sesión, así que
    // la aplicación nunca pregunta por una empresa que no sea suya. Queda
    // escrito aquí para que nadie construya encima la suposición contraria.
    const otra = await estadoDe(soloPcr.org, soloQuality.cli);
    assert(!isEnterableState(otra.get("cpr")!),
      "leer la empresa de otro concedió acceso a su módulo");
  });

  await check("O. Entitlement no es autorización", async () => {
    // Entrar a un módulo no dice nada del rol: quien creó la empresa es su
    // administrador, y el estado del módulo es el mismo para cualquier miembro.
    const e = await estadoDe(soloQuality.org, soloQuality.cli);
    assert(e.get("quality") === "full", "el estado depende del rol");
    const { data: rol } = await soloQuality.cli.from("memberships")
      .select("role_code").eq("organization_id", soloQuality.org).maybeSingle();
    assert(rol, "no se pudo leer el rol");
    // El acceso se resolvió sin consultar el rol para nada.
    const fuente = (await import("node:fs")).readFileSync("lib/db/module-access.ts", "utf8");
    assert(!/role_code|memberships/.test(fuente.split("SUPERADMINISTRADOR")[0]),
      "la resolución de acceso mira el rol del usuario");
  });

  // =========================================================================
  console.log("\nO · Aislamiento");
  // =========================================================================

  await check("L. Cada empresa ve SU verdad, y solo la suya", async () => {
    const a = await estadoDe(soloQuality.org, soloQuality.cli);
    const b = await estadoDe(soloPcr.org, soloPcr.cli);
    assert(a.get("quality") === "full" && !isEnterableState(a.get("cpr")!),
      "la empresa de Quality ve PCR");
    assert(b.get("cpr") === "full" && !isEnterableState(b.get("quality")!),
      "la empresa de PCR ve Quality");
  });

  await check("K. Cambiar de empresa recalcula: nada se arrastra", async () => {
    // La acción de cambiar empresa redirige a la puerta; lo que se comprueba
    // aquí es que el estado se recalcula por empresa, no por sesión.
    const antes = await estadoDe(qualityPcr.org, qualityPcr.cli);
    const despues = await estadoDe(soloQuality.org, soloQuality.cli);
    assert(isEnterableState(antes.get("cpr")!), "el escenario de control cambió");
    assert(!isEnterableState(despues.get("cpr")!),
      "el módulo de la empresa anterior se arrastró a la siguiente");
    const accion = (await import("node:fs"))
      .readFileSync("server/actions/organizations.ts", "utf8");
    assert(/redirect\(MODULE_SELECTOR_PATH\)/.test(accion),
      "cambiar de empresa dejó de llevar a la puerta");
  });

  console.log(`\nPE-01B · acceso: ${passed} en verde, ${failed} en rojo\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
