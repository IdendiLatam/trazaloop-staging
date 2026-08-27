/**
 * Trazaloop · QUALITY-12.2A · La guía canónica contra base real.
 *
 * Lo que no se puede comprobar leyendo código: que los 250 textos llegaron
 * enteros, que publicar una revisión conserva la anterior, que preguntar por
 * una fecha devuelve la guía de esa fecha, y —lo más importante— que una
 * empresa en Demo no puede sacar el texto por ningún camino: ni por la
 * función, ni por la tabla, ni por identificador directo, ni cambiando de
 * módulo.
 *
 * No se llama a ningún proveedor de IA. QUALITY-12.2A no toca esa capa.
 */
import { config as loadEnv } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

loadEnv({ path: ".env.local" });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !ANON || !SERVICE) {
  console.error("Faltan variables para test:quality122a-rls.");
  process.exit(1);
}

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
async function check(n: string, fn: () => Promise<void>) {
  try { await fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}

const admin = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });
const publico = createClient(URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } });
const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

async function newUser(label: string) {
  const email = `q122a-${label}-${stamp}@test.trazaloop.dev`;
  const password = "Trazaloop-Test-1234";
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: `QA ${label}` },
  });
  if (error || !data.user) throw new Error(`usuario ${label}: ${error?.message}`);
  const client = createClient(URL!, ANON!, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error: e } = await client.auth.signInWithPassword({ email, password });
  if (e) throw new Error(`login ${label}: ${e.message}`);
  return { id: data.user.id, email, client: client as unknown as SupabaseClient };
}

/** Las secciones que tenían hint antes del traslado: el material real, sin las
 *  guías de prueba que esta misma suite crea. */
async function idsConHint(): Promise<string[]> {
  const { data } = await admin.from("trazadoc_blueprint_sections")
    .select("id").not("hint", "is", null);
  return (data ?? []).map((r) => String((r as Record<string, unknown>).id));
}

async function main() {
  console.log("\nQUALITY-12.2A · guía canónica contra base real\n");

  // La guía es catálogo del producto: solo la administración de plataforma la
  // publica. La clave de servicio no basta —`auth.uid()` es nulo—, así que la
  // prueba usa un superadministrador de verdad, que es el camino real.
  const plataforma = await newUser("plat");
  await admin.from("platform_staff").insert({
    user_id: plataforma.id, role_code: "superadmin", status: "active",
  });

  // ==========================================================================
  console.log("A · EL TRASLADO DE LOS 250");
  // ==========================================================================

  await check("A1. tantas guías vigentes como hints había", async () => {
    const { count: hints } = await admin.from("trazadoc_blueprint_sections")
      .select("id", { count: "exact", head: true }).not("hint", "is", null);
    // Se cuentan solo las guías del material trasladado: esta misma suite crea
    // una guía de prueba más adelante, y contarla aquí haría que el resultado
    // dependiera de cuántas veces se ha ejecutado. El cruce se hace en memoria
    // —son doscientas y pico filas— porque una lista de 250 identificadores en
    // la URL no es una consulta, es una trampa.
    const conHint = new Set(await idsConHint());
    const { data: ident } = await admin.from("trazadoc_authoring_guidance")
      .select("blueprint_section_id");
    const { data: vig } = await admin.from("v_trazadoc_authoring_guidance_current")
      .select("blueprint_section_id");
    const cuenta = (rows: unknown[] | null) => (rows ?? [])
      .filter((r) => conHint.has(String((r as Record<string, unknown>).blueprint_section_id))).length;
    assert(hints === 250, `había ${hints} hints, se esperaban 250`);
    assert(cuenta(ident) === 250, `${cuenta(ident)} identidades para ${hints} hints`);
    assert(cuenta(vig) === 250, `${cuenta(vig)} guías vigentes para ${hints} hints`);
  });

  await check("A2. no se perdió módulo, estructura, clave ni contenido", async () => {
    const conHint = new Set(await idsConHint());
    const { data } = await admin.from("v_trazadoc_authoring_guidance_current")
      .select("blueprint_section_id, module_key, blueprint_code, section_key, guidance, revision_number");
    const guias = ((data ?? []) as Record<string, unknown>[])
      .filter((g) => conHint.has(String(g.blueprint_section_id)));
    const { data: secs } = await admin.from("trazadoc_blueprint_sections")
      .select("id, section_key, blueprint_id, hint");
    const { data: bps } = await admin.from("trazadoc_blueprints").select("id, code, module_key");
    const porBp = new Map((bps ?? []).map((b) => [String((b as Record<string, unknown>).id), b as Record<string, unknown>]));
    const porSec = new Map((secs ?? []).map((s) => [String((s as Record<string, unknown>).id), s as Record<string, unknown>]));

    let identicos = 0, corregidos = 0;
    for (const g of guias) {
      const s = porSec.get(String(g.blueprint_section_id));
      assert(s, `una guía apunta a una sección que no existe`);
      const b = porBp.get(String(s!.blueprint_id));
      assert(g.module_key === b!.module_key, `módulo distinto en ${g.section_key}`);
      assert(g.blueprint_code === b!.code, `estructura distinta en ${g.section_key}`);
      assert(g.section_key === s!.section_key, `clave distinta`);
      if (String(g.guidance) === String(s!.hint).trim()) identicos += 1;
      else corregidos += 1;
    }
    assert(identicos + corregidos === 250, `${identicos + corregidos} guías comparadas`);
    // Las corregidas son las normativas, y son revisión 2.
    const rev2 = guias.filter((g) => Number(g.revision_number) === 2).length;
    assert(rev2 === corregidos,
      `${corregidos} textos distintos del original pero ${rev2} en revisión 2`);
    console.log(`      ${identicos} idénticos · ${corregidos} corregidos por normativa`);
  });

  await check("A3. la huella distingue lo que cambió de lo que no", async () => {
    const { data } = await admin.from("trazadoc_authoring_guidance_revisions")
      .select("guidance_id, revision_number, content_hash");
    const filas = (data ?? []) as Record<string, unknown>[];
    for (const f of filas) {
      assert(/^[0-9a-f]{64}$/.test(String(f.content_hash)),
        "una revisión sin huella de contenido");
    }
    const porGuia = new Map<string, Set<string>>();
    for (const f of filas) {
      const s = porGuia.get(String(f.guidance_id)) ?? new Set<string>();
      s.add(String(f.content_hash));
      porGuia.set(String(f.guidance_id), s);
    }
    for (const [g, hashes] of porGuia) {
      const n = filas.filter((f) => f.guidance_id === g).length;
      assert(hashes.size === n, `la guía ${g} tiene revisiones con la misma huella`);
    }
  });

  // ==========================================================================
  console.log("\nB · LA HISTORIA, DE VERDAD");
  // ==========================================================================

  let GUIA = "", SECCION = "", BLUEPRINT = "", MODULO = "";

  await check("B0. se monta una guía de prueba con dos revisiones", async () => {
    // Una estructura y una sección propias: no se toca el material real.
    const { data: bp, error: eb } = await admin.from("trazadoc_blueprints").insert({
      code: `Q122A-${stamp}`.slice(0, 40), name: `Estructura de prueba ${stamp}`,
      document_type: "procedure", status: "active", module_key: "cpr",
    }).select("id, code, module_key").single();
    assert(!eb, `estructura: ${eb?.message}`);
    BLUEPRINT = bp!.id as string; MODULO = bp!.module_key as string;

    const { data: sec, error: es } = await admin.from("trazadoc_blueprint_sections").insert({
      blueprint_id: BLUEPRINT, section_key: "alcance", title: "Alcance",
      sort_order: 1, is_required: true, status: "active",
    }).select("id").single();
    assert(!es, `sección: ${es?.message}`);
    SECCION = sec!.id as string;

    const { data: g, error: eg } = await admin.from("trazadoc_authoring_guidance").insert({
      scope: "blueprint_section", module_key: MODULO, blueprint_code: bp!.code,
      section_key: "alcance", blueprint_section_id: SECCION,
    }).select("id").single();
    assert(!eg, `identidad: ${eg?.message}`);
    GUIA = g!.id as string;
  });

  await check("B1. la revisión 1 se publica y queda vigente", async () => {
    const { error } = await plataforma.client.rpc("trazadoc_publish_guidance", {
      p_guidance_id: GUIA,
      p_guidance: "Indique el alcance del procedimiento y qué queda fuera.",
      p_change_note: "Primera redacción",
    });
    assert(!error, `publicar: ${error?.message}`);
    const { data } = await admin.from("v_trazadoc_authoring_guidance_current")
      .select("revision_number, guidance").eq("guidance_id", GUIA).single();
    const f = data as Record<string, unknown>;
    assert(Number(f.revision_number) === 1, `es la revisión ${f.revision_number}`);
    assert(/Indique el alcance/.test(String(f.guidance)), "no es el texto publicado");
  });

  // Una pausa mínima para que las dos revisiones no compartan instante: la
  // resolución histórica se apoya en el reloj de la base, no en un contador.
  await new Promise((r) => setTimeout(r, 1100));
  const ENTRE_REVISIONES = new Date().toISOString();
  await new Promise((r) => setTimeout(r, 1100));

  await check("B2. publicar otra vez crea la revisión 2 y cierra la 1", async () => {
    const { error } = await plataforma.client.rpc("trazadoc_publish_guidance", {
      p_guidance_id: GUIA,
      p_guidance: "Delimite productos, plantas y procesos cubiertos, y diga cuáles quedan fuera.",
      p_change_note: "Se concreta qué delimitar",
    });
    assert(!error, `publicar: ${error?.message}`);

    const { data } = await admin.from("trazadoc_authoring_guidance_revisions")
      .select("revision_number, effective_from, effective_to, superseded_by_revision_id, id")
      .eq("guidance_id", GUIA).order("revision_number");
    const revs = (data ?? []) as Record<string, unknown>[];
    assert(revs.length === 2, `hay ${revs.length} revisiones`);
    assert(revs[0].effective_to !== null, "la revisión 1 quedó abierta");
    assert(revs[0].superseded_by_revision_id === revs[1].id,
      "la revisión 1 no dice quién la sucede");
    assert(revs[1].effective_to === null, "la revisión 2 no quedó vigente");
  });

  await check("B3. republicar lo mismo NO crea una revisión", async () => {
    const { count: antes } = await admin.from("trazadoc_authoring_guidance_revisions")
      .select("id", { count: "exact", head: true }).eq("guidance_id", GUIA);
    await plataforma.client.rpc("trazadoc_publish_guidance", {
      p_guidance_id: GUIA,
      p_guidance: "Delimite productos, plantas y procesos cubiertos, y diga cuáles quedan fuera.",
    });
    const { count: despues } = await admin.from("trazadoc_authoring_guidance_revisions")
      .select("id", { count: "exact", head: true }).eq("guidance_id", GUIA);
    assert(antes === despues, `se creó una revisión repetida: ${antes} → ${despues}`);
  });

  await check("B4. una revisión publicada NO se puede modificar ni borrar", async () => {
    const { data: rev } = await admin.from("trazadoc_authoring_guidance_revisions")
      .select("id").eq("guidance_id", GUIA).eq("revision_number", 1).single();
    const { error: eUpd } = await admin.from("trazadoc_authoring_guidance_revisions")
      .update({ guidance: "texto reescrito a mano" }).eq("id", rev!.id as string);
    assert(eUpd !== null, "se reescribió una revisión publicada");
    const { error: eDel } = await admin.from("trazadoc_authoring_guidance_revisions")
      .delete().eq("id", rev!.id as string);
    assert(eDel !== null, "se borró una revisión publicada");
  });

  // ==========================================================================
  console.log("\nC · LA PRUEBA HISTÓRICA");
  // ==========================================================================

  const jefa = await newUser("adm");
  await jefa.client.rpc("accept_active_legal_documents", { p_ip_address: null, p_user_agent: "q122a" });
  const { data: orgId } = await jefa.client.rpc("create_organization", { p_name: `Q122A ${stamp}` });
  const ORG = orgId as string;
  // El módulo COMERCIAL de CPR se llama `traceability_6632`; las estructuras
  // lo llaman `cpr`. Son dos vocabularios distintos y aquí hace falta el
  // primero, que es el que decide el plan.
  const MODULO_COMERCIAL = "traceability_6632";
  const { error: eMod } = await admin.from("organization_modules")
    .update({ enabled: true, access_mode: "full", access_expires_at: null })
    .eq("organization_id", ORG).eq("module_code", MODULO_COMERCIAL);
  if (eMod) throw new Error(`plan: ${eMod.message}`);

  await check("C1. AHORA devuelve la revisión 2", async () => {
    const { data, error } = await jefa.client.rpc("trazadoc_guidance_as_of", {
      p_organization_id: ORG, p_module_code: MODULO_COMERCIAL,
      p_blueprint_id: BLUEPRINT, p_as_of: null,
    });
    assert(!error, `resolver: ${error?.message}`);
    const filas = (data ?? []) as Record<string, unknown>[];
    assert(filas.length === 1, `devolvió ${filas.length} guías`);
    assert(Number(filas[0].revision_number) === 2,
      `devolvió la revisión ${filas[0].revision_number}`);
    assert(/Delimite productos/.test(String(filas[0].guidance)),
      "no es el texto vigente");
  });

  await check("C2. A FECHA, durante la vigencia de la 1, devuelve la revisión 1", async () => {
    const { data, error } = await jefa.client.rpc("trazadoc_guidance_as_of", {
      p_organization_id: ORG, p_module_code: MODULO_COMERCIAL,
      p_blueprint_id: BLUEPRINT, p_as_of: ENTRE_REVISIONES,
    });
    assert(!error, `resolver: ${error?.message}`);
    const filas = (data ?? []) as Record<string, unknown>[];
    assert(filas.length === 1, `devolvió ${filas.length} guías`);
    assert(Number(filas[0].revision_number) === 1,
      `devolvió la revisión ${filas[0].revision_number}, no la de entonces`);
    assert(/Indique el alcance/.test(String(filas[0].guidance)),
      "no devolvió el texto de entonces");
    assert(!/Delimite productos/.test(String(filas[0].guidance)),
      "coló el texto de hoy en una consulta histórica");
  });

  // ==========================================================================
  console.log("\nD · DEMO NO PUEDE SACAR LA GUÍA");
  // ==========================================================================

  await check("D1. en Full sí llega el texto", async () => {
    const { data } = await jefa.client.rpc("trazadoc_guidance_as_of", {
      p_organization_id: ORG, p_module_code: MODULO_COMERCIAL, p_blueprint_id: BLUEPRINT, p_as_of: null,
    });
    const f = ((data ?? []) as Record<string, unknown>[])[0];
    assert(f.restricted === false, "un plan Full quedó restringido");
    assert(typeof f.guidance === "string" && f.guidance.length > 0, "no llegó el texto");
  });

  await check("D2. en Extra también", async () => {
    await admin.from("organization_modules").update({ access_mode: "extra" })
      .eq("organization_id", ORG).eq("module_code", MODULO_COMERCIAL);
    const { data } = await jefa.client.rpc("trazadoc_guidance_as_of", {
      p_organization_id: ORG, p_module_code: MODULO_COMERCIAL, p_blueprint_id: BLUEPRINT, p_as_of: null,
    });
    const f = ((data ?? []) as Record<string, unknown>[])[0];
    assert(f.restricted === false, "un plan Extra quedó restringido");
    assert(typeof f.guidance === "string", "no llegó el texto en Extra");
  });

  await check("D3. en DEMO no llega ni una palabra, pero se sabe que hay guía", async () => {
    await admin.from("organization_modules")
      .update({ access_mode: "demo", access_expires_at: new Date(Date.now() + 86_400_000).toISOString() })
      .eq("organization_id", ORG).eq("module_code", MODULO_COMERCIAL);
    const { data } = await jefa.client.rpc("trazadoc_guidance_as_of", {
      p_organization_id: ORG, p_module_code: MODULO_COMERCIAL, p_blueprint_id: BLUEPRINT, p_as_of: null,
    });
    const f = ((data ?? []) as Record<string, unknown>[])[0];
    assert(f.has_guidance === true, "en Demo no se sabe que la sección tiene guía");
    assert(f.restricted === true, "en Demo no se declara la restricción");
    for (const campo of ["guidance", "purpose", "example", "do_not_invent",
                         "normative_class", "revision_number", "revision_id"]) {
      assert(f[campo] === null, `en Demo llegó ${campo}: ${JSON.stringify(f[campo])}`);
    }
  });

  await check("D4. en Demo tampoco por la TABLA, ni por identificador directo", async () => {
    const { data: t1 } = await jefa.client.from("trazadoc_authoring_guidance_revisions")
      .select("guidance").eq("guidance_id", GUIA);
    assert((t1 ?? []).length === 0, "un miembro leyó el texto directamente de la tabla");

    const { data: t2 } = await jefa.client.from("trazadoc_authoring_guidance")
      .select("id, section_key").eq("id", GUIA);
    assert((t2 ?? []).length === 0, "un miembro leyó la identidad directamente");

    const { data: t3 } = await jefa.client.from("v_trazadoc_authoring_guidance_current")
      .select("guidance").eq("guidance_id", GUIA);
    assert((t3 ?? []).length === 0, "un miembro leyó el texto por la vista de plataforma");
  });

  await check("D5. en Demo tampoco cambiando de módulo en la petición", async () => {
    // Textiles también está en Demo por provisión: pedir la guía de una
    // estructura de CPR declarando otro módulo no puede abrir ninguna puerta,
    // porque el plan que se comprueba es el del módulo declarado.
    const { data } = await jefa.client.rpc("trazadoc_guidance_as_of", {
      p_organization_id: ORG, p_module_code: "textiles",
      p_blueprint_id: BLUEPRINT, p_as_of: null,
    });
    const filas = (data ?? []) as Record<string, unknown>[];
    assert(filas.length > 0, "la prueba no llegó a ejercitar nada");
    for (const f of filas) {
      assert(f.guidance === null, "cambiar de módulo en la petición entregó el texto");
      assert(f.restricted === true, "no se declaró la restricción");
    }
  });

  await check("D6. una petición malformada no entrega nada", async () => {
    for (const args of [
      { p_organization_id: ORG, p_module_code: "", p_blueprint_id: BLUEPRINT, p_as_of: null },
      { p_organization_id: ORG, p_module_code: "cpr", p_blueprint_id: null, p_as_of: null },
      { p_organization_id: ORG, p_module_code: "'; select 1 --", p_blueprint_id: BLUEPRINT, p_as_of: null },
    ]) {
      const { data, error } = await jefa.client.rpc("trazadoc_guidance_as_of", args as never);
      const filas = (data ?? []) as Record<string, unknown>[];
      if (!error) {
        for (const f of filas) {
          assert(f.guidance === null, `una petición malformada entregó texto: ${JSON.stringify(args)}`);
        }
      }
    }
  });

  await check("D7. una empresa ajena no obtiene guía de otra", async () => {
    const ajena = await newUser("out");
    await ajena.client.rpc("accept_active_legal_documents", { p_ip_address: null, p_user_agent: "q122a" });
    const { error } = await ajena.client.rpc("trazadoc_guidance_as_of", {
      p_organization_id: ORG, p_module_code: MODULO_COMERCIAL, p_blueprint_id: BLUEPRINT, p_as_of: null,
    });
    assert(error !== null, "alguien de fuera resolvió la guía de esta empresa");
  });

  await check("D8. el anónimo no alcanza nada", async () => {
    for (const t of ["trazadoc_authoring_guidance", "trazadoc_authoring_guidance_revisions",
                     "v_trazadoc_authoring_guidance_current"]) {
      const { data, error } = await publico.from(t).select("*").limit(1);
      assert(error || (data ?? []).length === 0, `${t}: el anónimo lee filas`);
    }
    const { data, error } = await publico.rpc("trazadoc_guidance_as_of", {
      p_organization_id: ORG, p_module_code: MODULO_COMERCIAL, p_blueprint_id: BLUEPRINT, p_as_of: null,
    });
    assert(error || (data ?? []).length === 0, "el anónimo resolvió guía");
  });

  // ==========================================================================
  console.log("\nE · LA COLUMNA ANTIGUA YA NO MANDA");
  // ==========================================================================

  await check("E1. `hint` está congelado: no se puede cambiar", async () => {
    const { error } = await admin.from("trazadoc_blueprint_sections")
      .update({ hint: "intento de cambiar la guía por la puerta de atrás" })
      .eq("id", SECCION);
    assert(error !== null, "la columna congelada se dejó cambiar");
    assert(/congelad/i.test(error!.message), `mensaje inesperado: ${error!.message}`);
  });

  await check("E2. lo estructural de la sección SÍ se puede seguir editando", async () => {
    const { error } = await admin.from("trazadoc_blueprint_sections")
      .update({ title: "Alcance del procedimiento" }).eq("id", SECCION);
    assert(!error, `congelar el hint bloqueó lo demás: ${error?.message}`);
  });

  await check("E3. solo plataforma publica guía", async () => {
    const { error } = await jefa.client.rpc("trazadoc_publish_guidance", {
      p_guidance_id: GUIA, p_guidance: "Un usuario de empresa reescribiendo la guía del producto.",
    });
    assert(error !== null, "un usuario de empresa publicó una guía");
  });

  // ==========================================================================
  console.log("\nF · LA REVISIÓN NORMATIVA");
  // ==========================================================================

  await check("F1. ninguna guía vigente queda en riesgo de conformidad", async () => {
    const { data } = await admin.from("v_trazadoc_authoring_guidance_current")
      .select("blueprint_code, section_key, normative_class, guidance")
      .in("normative_class", ["conformity_risk", "certification_risk"]);
    const filas = (data ?? []) as Record<string, unknown>[];
    assert(filas.length === 0,
      `quedan ${filas.length} en riesgo: ${filas.map((f) => `${f.blueprint_code}·${f.section_key}`).join(", ")}`);
  });

  await check("F2. las que citan normas llevan la barrera al lado", async () => {
    const { data } = await admin.from("v_trazadoc_authoring_guidance_current")
      .select("section_key, normative_class, do_not_invent")
      .neq("normative_class", "safe");
    const filas = (data ?? []) as Record<string, unknown>[];
    assert(filas.length > 0, "ninguna guía quedó clasificada como normativa");
    for (const f of filas) {
      assert(typeof f.do_not_invent === "string" && f.do_not_invent.length > 0,
        `${f.section_key} cita una norma y no dice qué no se puede afirmar`);
      assert(/no afirmar que la empresa/i.test(String(f.do_not_invent)),
        `${f.section_key} no lleva la prohibición de afirmar cumplimiento`);
    }
  });

  await check("F3. las corregidas conservan su versión anterior", async () => {
    const { data } = await admin.from("trazadoc_authoring_guidance_revisions")
      .select("guidance_id, revision_number, guidance, change_note")
      .eq("revision_number", 2);
    const filas = (data ?? []) as Record<string, unknown>[];
    // Nueve del traslado normativo, más la de prueba de esta suite.
    assert(filas.length >= 9, `solo hay ${filas.length} correcciones`);
    for (const f of filas) {
      if (!/§8/.test(String(f.change_note ?? ""))) continue;
      assert(/no equivale a cumplirlos ni a estar certificado/.test(String(f.guidance)),
        "una corrección normativa no dice que citar no es cumplir");
      const { data: r1 } = await admin.from("trazadoc_authoring_guidance_revisions")
        .select("guidance, effective_to").eq("guidance_id", f.guidance_id as string)
        .eq("revision_number", 1).single();
      assert(r1 !== null, "se perdió la versión anterior de una guía corregida");
      assert((r1 as Record<string, unknown>).effective_to !== null,
        "la versión anterior quedó abierta");
    }
  });

  console.log(`\nResultado: ${passed} conformes, ${failed} fallos\n`);
  process.exit(failed === 0 ? 0 : 1);
}

void main();
