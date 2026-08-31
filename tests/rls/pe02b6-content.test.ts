/**
 * Trazaloop · PE-02B6 · El contenido de PE-02, listo y sin publicar.
 *
 * La comprobación más importante de este tramo es una que no cambia nada: que
 * después de aplicar las dos confirmaciones de la dirección, la política vigente
 * siga siendo la de siempre y las quince respuestas sigan siendo borradores.
 *
 * Correr: npm run test:pe02b6-content
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

const admin = createClient(URL, SERVICE,
  { auth: { autoRefreshToken: false, persistSession: false } });
const sello = `${Date.now()}`;
const password = "Trazaloop-Test-1234";
const anonimo: SupabaseClient = createClient(URL, ANON,
  { auth: { autoRefreshToken: false, persistSession: false } });

const SLUGS = [
  "seguridad_como_protege", "seguridad_otra_empresa", "seguridad_como_separa",
  "seguridad_equipo_trazaloop", "seguridad_archivos", "seguridad_permisos",
  "seguridad_intelligence", "seguridad_ia_otras_empresas",
  "seguridad_que_recibe_proveedor", "seguridad_entrenamiento_modelos",
  "seguridad_retencion_proveedor", "seguridad_modelo_sin_base",
  "seguridad_ia_no_decide", "seguridad_anonimato", "seguridad_publicar",
];

async function main() {
  const email = `pe02b6-${sello}@test.trazaloop.dev`;
  const { data: creado } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: "QA B6" } });
  assert(creado.user, "crear persona");
  const sa: SupabaseClient = createClient(URL!, ANON!,
    { auth: { autoRefreshToken: false, persistSession: false } });
  const { error: eLogin } = await sa.auth.signInWithPassword({ email, password });
  assert(!eLogin, `login: ${eLogin?.message}`);
  await admin.from("platform_staff")
    .insert({ user_id: creado.user.id, role_code: "superadmin", status: "active" });

  console.log("\nPE-02B6 · El contenido, listo y sin publicar\n");

  const borrador = async (slug: string) => {
    const { data: e } = await sa.from("faq_entries").select("id").eq("slug", slug).single();
    const { data } = await sa.from("faq_entry_drafts").select("*")
      .eq("entry_id", (e as { id: string }).id).eq("language", "es").single();
    return data as Record<string, unknown>;
  };

  // =========================================================================
  console.log("A · Las dos confirmaciones, aplicadas");
  // =========================================================================

  await check("A1. El entrenamiento ya no está bloqueado, y dice las dos mitades",
    async () => {
      const d = await borrador("seguridad_entrenamiento_modelos");
      assert(d.verification_status === "verified_with_qualifier",
        `está en «${d.verification_status}»`);
      const texto = `${d.answer_short} ${d.answer_long}`;
      assert(/no ha activado la autorización/i.test(texto),
        "no se dice que Trazaloop no activó la autorización");
      assert(/documentación oficial/i.test(texto),
        "no se atribuye la política al proveedor");
      assert(/dos fuentes distintas/i.test(String(d.source_basis)),
        "la procedencia no distingue la política del proveedor de la confirmación humana");
      assert(/lo confirmó una persona, no el repositorio/i.test(String(d.verification_note)),
        "la salvedad no dice de dónde viene cada mitad");
    });

  await check("A2. Y la base ya la dejaría publicar", async () => {
    // No se publica: se comprueba que la barrera no la bloquearía. La
    // publicación es de B5B, tras aprobación.
    const d = await borrador("seguridad_entrenamiento_modelos");
    const bloqueantes = ["external_policy_verification_required", "not_verified",
      "must_not_claim"];
    assert(!bloqueantes.includes(String(d.verification_status)),
      "sigue bloqueada por la barrera");
    assert(String(d.verification_note ?? "").length >= 10,
      "está con salvedad y la salvedad no está escrita: la base la rechazaría");
  });

  await check("A3. La retención dice que NO hay retención cero", async () => {
    const d = await borrador("seguridad_retencion_proveedor");
    assert(d.verification_status === "verified_with_qualifier",
      `está en «${d.verification_status}»`);
    const texto = `${d.answer_short} ${d.answer_long}`;
    assert(/no tiene contratado un acuerdo de retención cero/i.test(texto),
      "no se dice que no hay retención cero");
    assert(/hasta 30 días/i.test(texto), "no se dice el plazo del proveedor");
    assert(/no es un acuerdo de retención cero/i.test(texto),
      "no se distingue pedir que no se almacene de la retención cero");
    assert(/no hay retención cero contratada/i.test(String(d.source_basis)),
      "la procedencia no recoge la confirmación de la dirección");
  });

  await check("A4. Las dos conservan su fuente oficial y su fecha", async () => {
    for (const slug of ["seguridad_entrenamiento_modelos", "seguridad_retencion_proveedor"]) {
      const d = await borrador(slug);
      assert(String(d.external_source_url ?? "").includes("openai.com"),
        `«${slug}» perdió la fuente oficial`);
      assert(d.external_source_checked_on === "2026-08-31",
        `«${slug}» perdió la fecha de consulta`);
    }
  });

  // =========================================================================
  console.log("\nB · Y sin embargo, nada se publicó");
  // =========================================================================

  await check("B1. Las quince siguen siendo borradores sin revisión", async () => {
    const { data } = await sa.from("faq_entries").select("id, slug, status").in("slug", SLUGS);
    assert(data && data.length === 15, `hay ${data?.length} de 15`);
    for (const e of data as { slug: string; status: string }[]) {
      assert(e.status === "draft", `«${e.slug}» está en «${e.status}»`);
    }
    const ids = (data ?? []).map((r) => String((r as { id: string }).id));
    const { data: revs } = await sa.from("faq_entry_revisions").select("id").in("entry_id", ids);
    assert(!revs || revs.length === 0, `hay ${revs?.length} revisiones publicadas`);
  });

  await check("B2. Ninguna se lee en la FAQ", async () => {
    const { data: publica } = await anonimo.from("v_faq_public").select("slug").in("slug", SLUGS);
    assert(!publica || publica.length === 0, `${publica?.length} son públicas`);
    const { data: conSesion } = await sa.from("v_faq_authenticated")
      .select("slug").in("slug", SLUGS);
    assert(!conSesion || conSesion.length === 0, `${conSesion?.length} se leen con sesión`);
  });

  await check("B3. La política vigente sigue siendo la v1", async () => {
    const { data } = await anonimo.from("legal_documents")
      .select("version, content").eq("document_type", "privacy").eq("status", "active");
    assert(data && data.length === 1, `hay ${data?.length} políticas vigentes`);
    assert((data![0] as { version: string }).version === "v1",
      `la vigente es «${(data![0] as { version: string }).version}»`);
  });

  await check("B4. La sucesora recoge las confirmaciones y sigue en borrador", async () => {
    const { data } = await sa.from("legal_documents")
      .select("status, content, published_at").eq("version", "v1.1-draft").single();
    const d = data as { status: string; content: string; published_at: string | null };
    assert(d.status === "draft", `está en «${d.status}»`);
    assert(d.published_at === null, "tiene fecha de publicación");
    assert(/No se ha activado/.test(d.content),
      "la sucesora no recoge la confirmación del entrenamiento");
    assert(/No se tiene contratado/.test(d.content),
      "la sucesora no recoge la confirmación de la retención");
    assert(!/PENDIENTE DE CONFIRMACIÓN HUMANA/.test(d.content),
      "la sucesora mantiene un aviso ya resuelto");
  });

  await check("B5. Y nadie tiene que volver a aceptar", async () => {
    const email2 = `pe02b6-acepta-${sello}@test.trazaloop.dev`;
    const { data: c2 } = await admin.auth.admin.createUser({
      email: email2, password, email_confirm: true, user_metadata: { full_name: "QA acepta" } });
    const cli: SupabaseClient = createClient(URL!, ANON!,
      { auth: { autoRefreshToken: false, persistSession: false } });
    await cli.auth.signInWithPassword({ email: email2, password });
    const { error } = await cli.rpc("accept_active_legal_documents",
      { p_ip_address: null, p_user_agent: "b6" });
    assert(!error, `aceptar: ${error?.message}`);
    const { data: suyas } = await admin.from("user_legal_acceptances")
      .select("version").eq("user_id", c2.user!.id);
    const versiones = (suyas ?? []).map((r) => String((r as { version: string }).version));
    assert(versiones.length === 2 && versiones.every((v) => v === "v1"),
      `se aceptaron ${versiones.join(", ")} y debía ser v1 dos veces`);
  });

  // =========================================================================
  console.log("\nC · La ayuda contextual, una sola verdad");
  // =========================================================================

  await check("C1. Las once siguen publicadas y son la fuente canónica", async () => {
    const { data } = await sa.from("help_items")
      .select("target_key, status").eq("page_key", "quality.context.interested_parties");
    assert(data && data.length === 11, `hay ${data?.length} ayudas y son 11`);
    const sinPublicar = (data as { target_key: string; status: string }[])
      .filter((i) => i.status !== "published");
    assert(sinPublicar.length === 0,
      `hay ${sinPublicar.length} ayudas sin publicar: la pantalla caería en la constante`);
  });

  await check("C2. Y coinciden una a una con las claves del código", async () => {
    const { INTERESTED_PARTIES_HELP } =
      await import("../../lib/domain/quality-interested-parties");
    const enCodigo = Object.keys(INTERESTED_PARTIES_HELP);
    const { data } = await sa.from("help_items")
      .select("target_key").eq("page_key", "quality.context.interested_parties");
    const enBase = new Set((data ?? [])
      .map((r) => String((r as { target_key: string }).target_key)));
    for (const k of enCodigo) {
      assert(enBase.has(k), `«${k}» está en el código y no en la base`);
    }
    assert(enBase.size === enCodigo.length,
      `la base tiene ${enBase.size} y el código ${enCodigo.length}`);
  });

  await check("C3. La precedencia es determinista, y la administrada gana", async () => {
    const { getPageHelp } = await import("../../lib/db/contextual-help");
    const { helpToHint } = await import("../../lib/domain/contextual-help");
    const { interestedPartiesHint, interestedPartiesHelpMap, INTERESTED_PARTIES_HELP } =
      await import("../../lib/domain/quality-interested-parties");

    const cargada = await getPageHelp("quality.context.interested_parties", "es", sa);
    assert(cargada.status === "ok", "no se pudo cargar la ayuda");
    const mapa = interestedPartiesHelpMap(cargada.help, helpToHint);

    // Con ayuda administrada, manda ella.
    const conAyuda = interestedPartiesHint("overview", mapa);
    assert(conAyuda, "no se resolvió la ayuda");
    assert(conAyuda!.text.includes("QUÉ ES"),
      "la administrada no llega con sus tres partes");

    // Sin ella, el respaldo: el mismo texto de siempre, no un hueco.
    const sinAyuda = interestedPartiesHint("overview");
    assert(sinAyuda, "sin ayuda administrada no se devuelve nada");
    assert(sinAyuda!.text === INTERESTED_PARTIES_HELP.overview,
      "el respaldo no es el texto de la constante");

    // Hoy los dos textos coinciden, y eso es correcto: 0158 sembró la base
    // COPIANDO la constante, para que publicar la ayuda no cambiara ni una
    // palabra de lo que ya se leía. Pero entonces comparar los dos textos no
    // demuestra nada. La precedencia se demuestra con un texto que solo puede
    // venir de la base.
    const inventado = { restricted: false as const, title: null,
      text: "TEXTO ADMINISTRADO DISTINTO" };
    const mandaLaBase = interestedPartiesHint("overview", { overview: inventado });
    assert(mandaLaBase!.text === inventado.text,
      "con ayuda administrada distinta, sigue ganando la constante");
    const sinEsaClave = interestedPartiesHint("overview", { relevance: inventado });
    assert(sinEsaClave!.text === INTERESTED_PARTIES_HELP.overview,
      "una clave ausente en el mapa no cae en el respaldo");
  });

  // =========================================================================
  console.log("\nD · La FAQ publicada sigue limpia");
  // =========================================================================

  await check("D1. Veinticuatro respuestas, sin jerga ni cifras comerciales", async () => {
    const { data } = await sa.from("faq_entry_revisions")
      .select("question, answer_short, answer_long, entry:faq_entries!inner(slug)")
      .is("effective_to", null);
    const filas = (data ?? []) as unknown as Record<string, unknown>[];
    const nuestras = filas.filter((r) => {
      const slug = String((r.entry as { slug: string }).slug);
      return !/^(qa_|b3_|seguridad_)/.test(slug);
    });
    assert(nuestras.length === 24, `hay ${nuestras.length} respuestas publicadas y eran 24`);

    for (const r of nuestras) {
      const slug = String((r.entry as { slug: string }).slug);
      const texto = `${r.question} ${r.answer_short} ${r.answer_long ?? ""}`;
      for (const jerga of ["RLS", "tenant", "entitlement", "endpoint", "payload",
        "backend", "schema"]) {
        assert(!new RegExp(`\\b${jerga}\\b`, "i").test(texto),
          `«${slug}» usa jerga de desarrollo: ${jerga}`);
      }
      assert(!/(US\$|USD|€|\b\d+ ?(MB|GB)\b)/i.test(texto),
        `«${slug}» escribe una cifra comercial`);
      assert(!/próximamente|estará disponible/i.test(texto),
        `«${slug}» presenta algo como futuro`);
      assert(String(r.answer_short).length <= 400,
        `«${slug}» tiene una respuesta corta de ${String(r.answer_short).length} caracteres`);
    }
  });

  await check("D2. Y ninguna promete soporte ni cumplimiento", async () => {
    const { data } = await anonimo.from("v_faq_public").select("slug, answer_short, answer_long");
    for (const r of (data ?? []) as Record<string, unknown>[]) {
      const texto = `${r.answer_short} ${r.answer_long ?? ""}`.toLowerCase();
      for (const p of ["garantizamos", "respondemos en", "tiempo de respuesta de",
        "te certificamos", "garantiza el cumplimiento"]) {
        assert(!texto.includes(p), `«${r.slug}» promete «${p}»`);
      }
    }
  });

  console.log(`\nPE-02B6 · contenido: ${passed} en verde, ${failed} en rojo\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
