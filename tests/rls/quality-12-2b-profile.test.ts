/**
 * Trazaloop · QUALITY-12.2B · Perfil de empresa y guía de Quality, contra base real.
 *
 * Lo que no se puede comprobar leyendo código: que una empresa antigua sin
 * perfil sigue funcionando, que los topes de la base rechazan de verdad, que
 * nadie lee el perfil de otra empresa, y que la guía por papel de sección
 * llega a Quality con la misma regla comercial que a CPR y Textiles.
 *
 * No se llama a ningún proveedor de IA. QUALITY-12.2B no toca esa capa.
 */
import { config as loadEnv } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

loadEnv({ path: ".env.local" });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !ANON || !SERVICE) {
  console.error("Faltan variables para test:quality122b-rls.");
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
  const email = `q122b-${label}-${stamp}@test.trazaloop.dev`;
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

const QUALITY_MODULE = "quality";

async function main() {
  console.log("\nQUALITY-12.2B · perfil y guía de Quality contra base real\n");

  const jefa = await newUser("adm");
  const consultor = await newUser("con");
  const ajena = await newUser("out");
  for (const u of [jefa, consultor, ajena]) {
    await u.client.rpc("accept_active_legal_documents", { p_ip_address: null, p_user_agent: "q122b" });
  }
  const { data: a } = await jefa.client.rpc("create_organization", { p_name: `Q122B A ${stamp}` });
  const { data: b } = await ajena.client.rpc("create_organization", { p_name: `Q122B B ${stamp}` });
  const A = a as string, B = b as string;
  await admin.from("memberships").insert([
    { organization_id: A, user_id: consultor.id, role_code: "consultant", status: "active" },
  ]);
  const J = jefa.client, C = consultor.client, O = ajena.client;

  // ==========================================================================
  console.log("A · EL CATÁLOGO DE SECTORES");
  // ==========================================================================

  await check("A1. el catálogo existe y lo lee cualquier miembro", async () => {
    const { data, error } = await J.from("organization_sectors")
      .select("code, name").eq("is_active", true);
    assert(!error, `leer sectores: ${error?.message}`);
    const filas = (data ?? []) as Record<string, unknown>[];
    assert(filas.length >= 12, `solo hay ${filas.length} sectores`);
    assert(filas.some((s) => s.code === "other"), "no hay «Otro»");
  });

  await check("A2. una empresa no puede inventarse un sector", async () => {
    const { error } = await J.from("organization_sectors")
      .insert({ code: `inventado${stamp}`.slice(0, 30), name: "Inventado" });
    assert(error !== null, "una empresa escribió en el catálogo global");
  });

  await check("A3. el anónimo no lo alcanza", async () => {
    const { data, error } = await publico.from("organization_sectors").select("code").limit(1);
    assert(error || (data ?? []).length === 0, "el anónimo lee el catálogo");
  });

  // ==========================================================================
  console.log("\nB · LA EMPRESA SIN PERFIL SIGUE FUNCIONANDO");
  // ==========================================================================

  await check("B1. una empresa recién creada no tiene perfil, y no pasa nada", async () => {
    const { data } = await J.from("organizations")
      .select("sector_code, primary_activity, products_services, organization_description")
      .eq("id", A).single();
    const f = data as Record<string, unknown>;
    assert(f.sector_code === null && f.primary_activity === null
      && f.products_services === null && f.organization_description === null,
      "una empresa nueva nació con perfil inventado");
  });

  await check("B2. el contexto compacto de una empresa sin perfil es válido y parcial", async () => {
    const { data, error } = await J.rpc("organization_authoring_context", { p_organization_id: A });
    assert(!error, `contexto: ${error?.message}`);
    const ctx = data as Record<string, unknown>;
    assert(typeof ctx.organization_name === "string" && ctx.organization_name.length > 0,
      "no llegó ni el nombre");
    for (const c of ["sector", "primary_activity", "products_services", "description"]) {
      assert(!(c in ctx), `un perfil vacío devolvió ${c}`);
    }
  });

  // ==========================================================================
  console.log("\nC · EDITAR EL PERFIL");
  // ==========================================================================

  await check("C1. quien administra puede completarlo", async () => {
    const { error } = await J.from("organizations").update({
      sector_code: "plastics",
      primary_activity: "Fabricación de envases plásticos a partir de resina reciclada",
      products_services: ["Envases para alimentos", "Preformas PET"],
      organization_description: "Planta que transforma resina reciclada posconsumo en "
        + "envases para la industria de alimentos y bebidas.",
    }).eq("id", A);
    assert(!error, `guardar perfil: ${error?.message}`);
  });

  await check("C2. el contexto compacto lo devuelve, y nada más", async () => {
    const { data } = await J.rpc("organization_authoring_context", { p_organization_id: A });
    const ctx = data as Record<string, unknown>;
    assert(ctx.sector === "Plásticos y caucho", `sector: ${ctx.sector}`);
    assert(/envases plásticos/i.test(String(ctx.primary_activity)), "no llegó la actividad");
    assert(Array.isArray(ctx.products_services)
      && (ctx.products_services as string[]).length === 2, "no llegaron los productos");
    // Y ni un campo que no sirva para redactar.
    for (const basura of ["id", "tax_id", "created_at", "logo_storage_path",
                          "contact_email", "address", "phone", "legal_name"]) {
      assert(!(basura in ctx), `el contexto arrastra ${basura}`);
    }
  });

  await check("C3. el perfil cabe en el presupuesto", async () => {
    const { data } = await J.rpc("organization_authoring_context", { p_organization_id: A });
    const ctx = data as Record<string, unknown>;
    const texto = [
      `Empresa: ${ctx.organization_name}`,
      `Sector: ${ctx.sector}`,
      `Actividad principal: ${ctx.primary_activity}`,
      `Productos o servicios: ${(ctx.products_services as string[]).join(", ")}`,
      `Descripción: ${ctx.description}`,
    ].join("\n");
    const tokens = Math.ceil(texto.length / 3.6);
    assert(tokens <= 260, `el perfil ocupa ${tokens} tokens`);
    console.log(`      perfil real ≈ ${tokens} tokens`);
  });

  await check("C4. la BASE rechaza lo que no cabe", async () => {
    const casos: [string, Record<string, unknown>][] = [
      ["actividad de 161 caracteres", { primary_activity: "x".repeat(161) }],
      ["descripción de 281", { organization_description: "y".repeat(281) }],
      ["descripción de 5", { organization_description: "corta" }],
      ["siete productos", { products_services: ["a", "b", "c", "d", "e", "f", "g"] }],
      ["un producto de 51", { products_services: ["z".repeat(51)] }],
      ["un producto vacío", { products_services: ["Envases", " "] }],
      ["un sector inventado", { sector_code: "sector_que_no_existe" }],
    ];
    for (const [nombre, payload] of casos) {
      const { error } = await J.from("organizations").update(payload).eq("id", A);
      assert(error !== null, `la base aceptó ${nombre}`);
    }
  });

  await check("C5. un rol sin permiso no puede editarlo", async () => {
    const { data } = await C.from("organizations")
      .update({ primary_activity: "Reescrito por quien no debe" }).eq("id", A).select("id");
    assert((data ?? []).length === 0, "un consultor cambió el perfil de la empresa");
    const { data: comprobar } = await J.from("organizations")
      .select("primary_activity").eq("id", A).single();
    assert(/envases plásticos/i.test(String((comprobar as Record<string, unknown>).primary_activity)),
      "el perfil quedó cambiado");
  });

  await check("C6. un consultor SÍ puede leerlo", async () => {
    const { data, error } = await C.rpc("organization_authoring_context", { p_organization_id: A });
    assert(!error, `un miembro no pudo leer el perfil: ${error?.message}`);
    assert((data as Record<string, unknown>).sector === "Plásticos y caucho",
      "un miembro no recibió el perfil");
  });

  // ==========================================================================
  console.log("\nD · NADIE VE EL PERFIL DE OTRA EMPRESA");
  // ==========================================================================

  await check("D1. una empresa ajena no resuelve el contexto", async () => {
    const { error } = await O.rpc("organization_authoring_context", { p_organization_id: A });
    assert(error !== null, "alguien de fuera leyó el perfil de esta empresa");
  });

  await check("D2. tampoco por la tabla, ni por identificador directo", async () => {
    const { data } = await O.from("organizations")
      .select("primary_activity, organization_description").eq("id", A);
    assert((data ?? []).length === 0, "una empresa ajena leyó el perfil por la tabla");
  });

  await check("D3. el anónimo no alcanza nada", async () => {
    const { data, error } = await publico.rpc("organization_authoring_context",
      { p_organization_id: A });
    assert(error || data === null, "el anónimo resolvió un perfil");
  });

  await check("D4. una empresa que no existe no filtra su ausencia", async () => {
    const { error } = await J.rpc("organization_authoring_context",
      { p_organization_id: "00000000-0000-0000-0000-000000000000" });
    assert(error !== null, "se resolvió el contexto de una empresa inexistente");
  });

  // ==========================================================================
  console.log("\nE · LA GUÍA DE QUALITY, POR PAPEL DE SECCIÓN");
  // ==========================================================================

  await check("E0. Quality en Full", async () => {
    const { error } = await admin.from("organization_modules")
      .update({ enabled: true, access_mode: "full", access_expires_at: null })
      .eq("organization_id", A).eq("module_code", QUALITY_MODULE);
    assert(!error, `plan: ${error?.message}`);
  });

  const CLAVES = ["purpose", "scope", "responsibilities", "development", "records"];

  await check("E1. los cinco papeles tienen guía", async () => {
    const { data, error } = await J.rpc("trazadoc_guidance_for_section_role", {
      p_organization_id: A, p_module_code: QUALITY_MODULE,
      p_guidance_module: "quality", p_section_keys: CLAVES, p_as_of: null,
    });
    assert(!error, `resolver: ${error?.message}`);
    const filas = (data ?? []) as Record<string, unknown>[];
    assert(filas.length === 5, `devolvió ${filas.length} guías de 5`);
    for (const f of filas) {
      assert(typeof f.guidance === "string" && (f.guidance as string).length > 20,
        `${f.section_key} sin guía usable`);
      assert(typeof f.purpose === "string", `${f.section_key} sin propósito`);
      assert(typeof f.do_not_invent === "string" && (f.do_not_invent as string).length > 10,
        `${f.section_key} no dice qué no se puede inventar`);
      assert(f.normative_class === "safe",
        `${f.section_key} quedó clasificada como ${f.normative_class}`);
      assert(Array.isArray(f.related_context_types)
        && (f.related_context_types as string[]).length > 0,
        `${f.section_key} no declara qué contexto pediría`);
    }
  });

  await check("E2. las guías de Quality no citan ninguna norma", async () => {
    const { data } = await J.rpc("trazadoc_guidance_for_section_role", {
      p_organization_id: A, p_module_code: QUALITY_MODULE,
      p_guidance_module: "quality", p_section_keys: CLAVES, p_as_of: null,
    });
    const todo = JSON.stringify(data);
    for (const n of [/\bISO\b/i, /\b9001\b/, /\bNTC\b/i, /certificad/i, /cumple con/i]) {
      assert(!n.test(todo), `una guía genérica de Quality menciona ${n}`);
    }
  });

  await check("E3. una sección a medida NO recibe guía", async () => {
    const { data } = await J.rpc("trazadoc_guidance_for_section_role", {
      p_organization_id: A, p_module_code: QUALITY_MODULE, p_guidance_module: "quality",
      p_section_keys: ["seccion_propia_de_la_empresa", "instrucciones_de_planta"],
      p_as_of: null,
    });
    assert((data ?? []).length === 0,
      "una sección inventada por la empresa recibió guía genérica");
  });

  await check("E4. en Demo no llega ni una palabra", async () => {
    await admin.from("organization_modules")
      .update({ access_mode: "demo", access_expires_at: new Date(Date.now() + 86_400_000).toISOString() })
      .eq("organization_id", A).eq("module_code", QUALITY_MODULE);
    const { data } = await J.rpc("trazadoc_guidance_for_section_role", {
      p_organization_id: A, p_module_code: QUALITY_MODULE,
      p_guidance_module: "quality", p_section_keys: CLAVES, p_as_of: null,
    });
    const filas = (data ?? []) as Record<string, unknown>[];
    assert(filas.length === 5, "en Demo se dejó de saber que hay guía");
    for (const f of filas) {
      assert(f.has_guidance === true, "en Demo no se sabe que la sección tiene guía");
      assert(f.restricted === true, "en Demo no se declara la restricción");
      for (const c of ["guidance", "purpose", "do_not_invent", "normative_class",
                       "related_context_types", "revision_number"]) {
        assert(f[c] === null, `en Demo llegó ${c}`);
      }
    }
  });

  await check("E5. en Extra sí, como en Full", async () => {
    await admin.from("organization_modules")
      .update({ access_mode: "extra", access_expires_at: null })
      .eq("organization_id", A).eq("module_code", QUALITY_MODULE);
    const { data } = await J.rpc("trazadoc_guidance_for_section_role", {
      p_organization_id: A, p_module_code: QUALITY_MODULE,
      p_guidance_module: "quality", p_section_keys: CLAVES, p_as_of: null,
    });
    const filas = (data ?? []) as Record<string, unknown>[];
    assert(filas.every((f) => f.restricted === false && typeof f.guidance === "string"),
      "un plan Extra quedó restringido");
  });

  await check("E6. un módulo equivocado no abre ninguna puerta", async () => {
    // Textiles está en Demo por provisión: pedir la guía de Quality declarando
    // Textiles comprueba el plan de Textiles, no el de Quality.
    const { data } = await J.rpc("trazadoc_guidance_for_section_role", {
      p_organization_id: A, p_module_code: "textiles",
      p_guidance_module: "quality", p_section_keys: CLAVES, p_as_of: null,
    });
    for (const f of (data ?? []) as Record<string, unknown>[]) {
      assert(f.guidance === null, "cambiar de módulo en la petición entregó el texto");
    }
  });

  await check("E7. una empresa ajena no resuelve guía de esta", async () => {
    const { error } = await O.rpc("trazadoc_guidance_for_section_role", {
      p_organization_id: A, p_module_code: QUALITY_MODULE,
      p_guidance_module: "quality", p_section_keys: CLAVES, p_as_of: null,
    });
    assert(error !== null, "alguien de fuera resolvió la guía de esta empresa");
  });

  await check("E8. no se puede enumerar el catálogo con peticiones malformadas", async () => {
    for (const args of [
      { p_section_keys: null },
      { p_section_keys: [] },
      { p_guidance_module: "" },
      { p_guidance_module: "'; select 1 --" },
      { p_section_keys: ["'; select guidance from trazadoc_authoring_guidance_revisions --"] },
    ] as Record<string, unknown>[]) {
      const { data, error } = await O.rpc("trazadoc_guidance_for_section_role", {
        p_organization_id: B, p_module_code: QUALITY_MODULE,
        p_guidance_module: "quality", p_section_keys: CLAVES, p_as_of: null, ...args,
      } as never);
      if (!error) {
        assert((data ?? []).length === 0,
          `una petición malformada devolvió filas: ${JSON.stringify(args)}`);
      }
    }
  });

  await check("E9. las tablas de guía siguen sin ser legibles por un miembro", async () => {
    for (const t of ["trazadoc_authoring_guidance", "trazadoc_authoring_guidance_revisions",
                     "v_trazadoc_authoring_guidance_current"]) {
      const { data } = await J.from(t).select("*").limit(1);
      assert((data ?? []).length === 0, `${t}: un miembro la lee directamente`);
    }
  });

  // ==========================================================================
  console.log("\nF · CPR Y TEXTILES CONSERVAN LA PARIDAD");
  // ==========================================================================

  await check("F1. la guía de las estructuras sigue en pie", async () => {
    const { data } = await admin.from("v_trazadoc_authoring_guidance_current")
      .select("guidance_id, module_key, scope");
    const filas = (data ?? []) as Record<string, unknown>[];
    const porEstructura = filas.filter((f) => f.scope === "blueprint_section");
    const porPapel = filas.filter((f) => f.scope === "section_role");
    assert(porEstructura.length >= 250,
      `quedan ${porEstructura.length} guías de estructura, se esperaban 250 o más`);
    assert(porPapel.length === 5, `hay ${porPapel.length} guías por papel, se esperaban 5`);
    assert(porPapel.every((f) => f.module_key === "quality"),
      "hay guías por papel fuera de Quality");
  });

  await check("F2. el enriquecimiento no perdió ninguna guía", async () => {
    const { data } = await admin.from("v_trazadoc_authoring_guidance_current")
      .select("guidance_id, guidance, do_not_invent, related_context_types, section_key")
      .eq("scope", "blueprint_section");
    const filas = (data ?? []) as Record<string, unknown>[];
    for (const f of filas) {
      assert(typeof f.guidance === "string" && (f.guidance as string).length > 10,
        `${f.section_key} se quedó sin texto tras el enriquecimiento`);
    }
    const conBarrera = filas.filter((f) => f.do_not_invent !== null).length;
    const conContexto = filas.filter(
      (f) => Array.isArray(f.related_context_types) && (f.related_context_types as string[]).length > 0).length;
    assert(conBarrera > 0 && conContexto > 0, "no se enriqueció nada");
    console.log(`      ${filas.length} guías de estructura · ${conBarrera} con barrera · ${conContexto} con contexto`);
  });

  await check("F3. el contexto relacionado solo admite valores de la taxonomía", async () => {
    const { data } = await admin.from("trazadoc_authoring_guidance_revisions")
      .select("related_context_types");
    const permitidos = new Set(["organization_profile", "process", "position", "document",
      "risk", "control", "indicator", "objective", "supplier", "customer_feedback",
      "evidence", "case"]);
    for (const r of (data ?? []) as Record<string, unknown>[]) {
      for (const v of (r.related_context_types as string[] | null) ?? []) {
        assert(permitidos.has(v), `valor fuera de la taxonomía: ${v}`);
      }
    }
    // Y la base lo rechaza, no solo lo respeta por costumbre.
    const { data: g } = await admin.from("trazadoc_authoring_guidance")
      .select("id").eq("scope", "section_role").limit(1).single();
    const { error } = await admin.from("trazadoc_authoring_guidance_revisions")
      .insert({
        guidance_id: (g as Record<string, unknown>).id, revision_number: 99,
        guidance: "prueba", content_hash: "x".repeat(64),
        related_context_types: ["inventado"],
      });
    assert(error !== null, "la base aceptó un tipo de contexto fuera de la taxonomía");
  });

  await check("F4. las revisiones de guía siguen siendo inmutables", async () => {
    const { data } = await admin.from("trazadoc_authoring_guidance_revisions")
      .select("id").eq("revision_number", 1).limit(1).single();
    const { error } = await admin.from("trazadoc_authoring_guidance_revisions")
      .update({ guidance: "reescrita a mano" })
      .eq("id", (data as Record<string, unknown>).id as string);
    assert(error !== null, "una revisión publicada se dejó reescribir");
  });

  console.log(`\nResultado: ${passed} conformes, ${failed} fallos\n`);
  process.exit(failed === 0 ? 0 : 1);
}

void main();
