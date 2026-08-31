/**
 * Trazaloop · PE-02B1 · La historia de una respuesta, contra base REAL.
 *
 * K, L y M del encargo: publicar cierra la anterior, una revisión publicada no
 * se modifica, y restaurar crea una revisión nueva en vez de reabrir la vieja.
 *
 * Es la parte que hace que dentro de un año se pueda contestar «¿qué respondía
 * Trazaloop sobre seguridad en marzo?». Sin estas tres, la FAQ es un documento
 * que se sobrescribe.
 *
 * Correr: npm run test:pe02b1-faq-history
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
const anonimo: SupabaseClient = createClient(URL, ANON,
  { auth: { autoRefreshToken: false, persistSession: false } });

async function main() {
  const email = `pe02b1-hist-${sello}@test.trazaloop.dev`;
  const password = "Trazaloop-Test-1234";
  const { data: creado } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: "QA PE-02B1 historia" } });
  assert(creado.user, "crear persona");
  const sa: SupabaseClient = createClient(URL!, ANON!,
    { auth: { autoRefreshToken: false, persistSession: false } });
  const { error: eLogin } = await sa.auth.signInWithPassword({ email, password });
  assert(!eLogin, `login: ${eLogin?.message}`);
  await admin.from("platform_staff")
    .insert({ user_id: creado.user.id, role_code: "superadmin", status: "active" });

  console.log("\nPE-02B1 · La historia de una respuesta\n");

  const { data: cat } = await sa.from("faq_categories")
    .select("id").eq("code", "seguridad").single();
  const { data: entrada, error: eEnt } = await sa.from("faq_entries").insert({
    slug: `qa_hist_${sello}`, category_id: (cat as { id: string }).id,
    visibility: "public",
  }).select("id").single();
  assert(!eEnt && entrada, `crear entrada: ${eEnt?.message}`);
  const id = (entrada as { id: string }).id;

  async function escribirBorrador(texto: string, extra: Record<string, unknown> = {}) {
    const { error } = await sa.from("faq_entry_drafts").upsert({
      entry_id: id, language: "es",
      question: "¿Pregunta de prueba de historia?",
      answer_short: texto, verification_status: "verified",
      source_basis: "prueba", ...extra,
    }, { onConflict: "entry_id,language" });
    assert(!error, `borrador: ${error?.message}`);
  }
  const revisiones = async () => {
    const { data } = await sa.from("faq_entry_revisions")
      .select("id, revision_number, answer_short, effective_from, effective_to, superseded_by_revision_id")
      .eq("entry_id", id).order("revision_number");
    return (data ?? []) as Record<string, unknown>[];
  };

  // ==========================================================================
  console.log("K · Publicar cierra la anterior");
  // ==========================================================================

  await check("K1. La primera publicación abre la revisión 1", async () => {
    await escribirBorrador("Primera redacción.");
    const { error } = await sa.rpc("faq_publish_entry",
      { p_entry_id: id, p_language: "es", p_change_note: "alta" });
    assert(!error, `publicar: ${error?.message}`);
    const r = await revisiones();
    assert(r.length === 1, `hay ${r.length} revisiones`);
    assert(r[0].revision_number === 1, "no se numeró desde 1");
    assert(r[0].effective_to === null, "nació cerrada");
  });

  await check("K2. La segunda cierra la primera y las enlaza", async () => {
    await escribirBorrador("Segunda redacción.");
    const { error } = await sa.rpc("faq_publish_entry",
      { p_entry_id: id, p_language: "es", p_change_note: "corrección" });
    assert(!error, `publicar: ${error?.message}`);
    const r = await revisiones();
    assert(r.length === 2, `hay ${r.length} revisiones`);
    assert(r[0].effective_to !== null, "la primera quedó abierta");
    assert(r[1].effective_to === null, "la segunda nació cerrada");
    assert(r[0].superseded_by_revision_id === r[1].id,
      "la primera no dice quién la sucede");
    assert(new Date(String(r[0].effective_to)).getTime()
      <= new Date(String(r[1].effective_from)).getTime() + 1,
      "hay un hueco entre las dos vigencias");
  });

  await check("K3. Solo hay UNA vigente, y es la última", async () => {
    const r = await revisiones();
    const abiertas = r.filter((x) => x.effective_to === null);
    assert(abiertas.length === 1, `hay ${abiertas.length} revisiones abiertas`);
    const { data } = await anonimo.from("v_faq_public")
      .select("answer_short").eq("slug", `qa_hist_${sello}`);
    assert(data && data.length === 1, `la vista pública devuelve ${data?.length} filas`);
    assert(String((data![0] as { answer_short: string }).answer_short)
      .includes("Segunda"), "la vista pública no enseña la vigente");
  });

  await check("K4. Publicar lo MISMO no crea una revisión nueva", async () => {
    const antes = (await revisiones()).length;
    const { error } = await sa.rpc("faq_publish_entry",
      { p_entry_id: id, p_language: "es", p_change_note: "sin cambios" });
    assert(!error, `publicar: ${error?.message}`);
    assert((await revisiones()).length === antes,
      "publicar el mismo texto ensució la historia con una revisión idéntica");
  });

  await check("K5. Retirar cierra la vigente y conserva el texto", async () => {
    const { error } = await sa.rpc("faq_unpublish_entry",
      { p_entry_id: id, p_language: "es" });
    assert(!error, `retirar: ${error?.message}`);
    const r = await revisiones();
    assert(r.every((x) => x.effective_to !== null), "quedó una revisión abierta");
    assert(r.length === 2, "retirar borró historia");
    const { data: est } = await sa.from("faq_entries")
      .select("status").eq("id", id).single();
    assert((est as { status: string }).status === "unpublished",
      `la entrada quedó en «${(est as { status: string }).status}»`);
    const { data: pub } = await anonimo.from("v_faq_public")
      .select("slug").eq("slug", `qa_hist_${sello}`);
    assert(!pub || pub.length === 0, "una entrada retirada se sigue leyendo");
  });

  await check("K6. Y volver a publicarla es publicar, no reabrir", async () => {
    const { error } = await sa.rpc("faq_publish_entry",
      { p_entry_id: id, p_language: "es", p_change_note: "vuelta" });
    assert(!error, `republicar: ${error?.message}`);
    const r = await revisiones();
    // El texto no cambió, así que la función reutiliza la revisión anterior…
    // salvo que estuviera cerrada. Aquí lo estaba: nace una nueva.
    assert(r.length === 3, `hay ${r.length} revisiones y deberían ser 3`);
    assert(r[2].effective_to === null, "la nueva nació cerrada");
    assert(r[1].effective_to !== null, "se reabrió una revisión cerrada");
  });

  // ==========================================================================
  console.log("\nL · Una revisión publicada no se modifica");
  // ==========================================================================

  await check("L1. Cambiar su texto se rechaza", async () => {
    const r = await revisiones();
    const { error } = await sa.from("faq_entry_revisions")
      .update({ answer_short: "reescrita a mano" }).eq("id", r[0].id);
    assert(error, "se pudo reescribir una revisión publicada");
    assert(/no se modifica|permission|denied/i.test(error!.message),
      `el rechazo llegó con un mensaje raro: ${error!.message}`);
  });

  await check("L2. Borrarla, también", async () => {
    const r = await revisiones();
    const { error, count } = await sa.from("faq_entry_revisions")
      .delete({ count: "exact" }).eq("id", r[0].id);
    assert(error || count === 0, "se pudo borrar una revisión publicada");
    assert((await revisiones()).length === 3, "desapareció una revisión");
  });

  await check("L3. Ni siquiera con la clave de servicio", async () => {
    // El freno vive en un disparador de la base, no en una política: la clave
    // de servicio se salta la RLS y no se salta esto.
    const r = await revisiones();
    const { error } = await admin.from("faq_entry_revisions")
      .update({ answer_short: "reescrita con service_role" }).eq("id", r[0].id);
    assert(error, "la clave de servicio pudo reescribir la historia");
    const { error: eDel } = await admin.from("faq_entry_revisions")
      .delete().eq("id", r[0].id);
    assert(eDel, "la clave de servicio pudo borrar una revisión");
  });

  await check("L4. Reabrir una revisión cerrada se rechaza", async () => {
    const r = await revisiones();
    const cerrada = r.find((x) => x.effective_to !== null)!;
    const { error } = await admin.from("faq_entry_revisions")
      .update({ effective_to: null }).eq("id", cerrada.id);
    assert(error, "se reabrió una revisión cerrada");
  });

  // ==========================================================================
  console.log("\nM · Restaurar");
  // ==========================================================================

  await check("M1. Restaurar copia al BORRADOR, no toca la historia", async () => {
    const r = await revisiones();
    const primera = r[0];
    const antes = r.length;
    const { error } = await sa.rpc("faq_restore_revision_to_draft",
      { p_revision_id: primera.id });
    assert(!error, `restaurar: ${error?.message}`);
    assert((await revisiones()).length === antes, "restaurar tocó la historia");

    const { data: b } = await sa.from("faq_entry_drafts")
      .select("answer_short, change_note").eq("entry_id", id).eq("language", "es").single();
    assert(String((b as { answer_short: string }).answer_short).includes("Primera"),
      "el borrador no recibió el texto antiguo");
    assert(String((b as { change_note: string }).change_note).includes("Restaurado"),
      "no queda dicho que esto viene de una restauración");
  });

  await check("M2. Y publicarlo crea una revisión NUEVA con el texto viejo", async () => {
    const antes = await revisiones();
    const { error } = await sa.rpc("faq_publish_entry",
      { p_entry_id: id, p_language: "es", p_change_note: "se vuelve a la primera" });
    assert(!error, `publicar restaurado: ${error?.message}`);
    const r = await revisiones();
    assert(r.length === antes.length + 1, "no nació una revisión");
    const vigente = r.find((x) => x.effective_to === null)!;
    assert(String(vigente.answer_short).includes("Primera"),
      "la vigente no lleva el texto restaurado");
    assert(vigente.revision_number === antes.length + 1,
      "la numeración no siguió: la historia diría que se volvió atrás en el tiempo");
    // Las tres cosas quedan escritas: lo que decía, lo que dijo después, y que
    // se volvió a lo primero.
    assert(r.filter((x) => String(x.answer_short).includes("Primera")).length === 2,
      "no se distingue la vez original de la restaurada");
  });

  await check("M3. Un superadministrador es imprescindible para todo esto",
    async () => {
      const { error } = await anonimo.rpc("faq_restore_revision_to_draft",
        { p_revision_id: (await revisiones())[0].id });
      assert(error, "el anónimo pudo restaurar");
    });

  console.log(`\nPE-02B1 · historia: ${passed} en verde, ${failed} en rojo\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
