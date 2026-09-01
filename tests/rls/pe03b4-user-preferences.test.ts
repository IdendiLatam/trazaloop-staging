/**
 * Trazaloop · PE-03B4 · Las preferencias, contra la base real.
 *
 * Esto es lo que NO se puede comprobar leyendo el código: que la RLS de 0161
 * aguante. Que A no lea lo de B, que A no escriba a nombre de B, que nadie
 * pueda deshacer «no volver a mostrar», y que un superadministrador de
 * plataforma no tenga aquí ningún privilegio especial — porque para esto no
 * lo tiene.
 *
 * Correr: npm run test:pe03b4-preferences
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

type Persona = { id: string; email: string; cli: SupabaseClient };

async function nuevaPersona(prefijo: string): Promise<Persona> {
  const email = `${prefijo}-${sello}-${Math.floor(Math.random() * 1e6)}@test.trazaloop.dev`;
  const { data } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: "QA B4" } });
  assert(data.user, `crear ${prefijo}`);
  const cli: SupabaseClient = createClient(URL!, ANON!,
    { auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await cli.auth.signInWithPassword({ email, password });
  assert(!error, `login ${prefijo}: ${error?.message}`);
  return { id: data.user.id, email, cli };
}

async function main() {
  console.log("\nPE-03B4 · Preferencias de persona\n");

  const a = await nuevaPersona("pref-a");
  const b = await nuevaPersona("pref-b");
  const jefe = await nuevaPersona("pref-super");
  // Superadministrador de plataforma, por asiento directo: en una base de
  // pruebas no hay un primero que autorice al primero.
  await admin.from("platform_staff")
    .insert({ user_id: jefe.id, role_code: "superadmin", status: "active" });

  try {
    // =====================================================================
    console.log("A · Cada quien, lo suyo");
    // =====================================================================

    await check("A1. Se guarda la propia preferencia", async () => {
      const { error } = await a.cli.rpc("set_user_preference",
        { p_key: "welcome_video_suppressed", p_value: null });
      assert(!error, `no se pudo guardar: ${error?.message}`);
      const { data } = await a.cli.from("user_preferences")
        .select("preference_key, user_id");
      assert((data ?? []).length === 1, `A ve ${(data ?? []).length} filas`);
      assert(data![0].user_id === a.id, "A ve una fila que no es suya");
    });

    await check("A2. Y guardarla dos veces no falla ni cambia el día", async () => {
      const { data: antes } = await a.cli.from("user_preferences").select("set_at").single();
      const { error } = await a.cli.rpc("set_user_preference",
        { p_key: "welcome_video_suppressed", p_value: null });
      assert(!error, `la segunda vez falló: ${error?.message}`);
      const { data: despues } = await a.cli.from("user_preferences").select("set_at").single();
      assert(antes!.set_at === despues!.set_at,
        "volver a pulsarlo reescribió el día en que se decidió");
    });

    await check("A3. Sin preferencia guardada, B no ve nada · y eso no es un error", async () => {
      const { data, error } = await b.cli.from("user_preferences").select("preference_key");
      assert(!error, `B recibió un error: ${error?.message}`);
      assert((data ?? []).length === 0, `B ve ${(data ?? []).length} filas`);
    });

    // =====================================================================
    console.log("\nB · La preferencia de otro no se lee ni se escribe");
    // =====================================================================

    await check("B1. B NO ve la preferencia de A", async () => {
      const { data } = await b.cli.from("user_preferences")
        .select("user_id, preference_key").eq("user_id", a.id);
      assert((data ?? []).length === 0,
        `B lee ${(data ?? []).length} filas de A`);
    });

    await check("B2. B NO puede escribir a nombre de A", async () => {
      const { error } = await b.cli.from("user_preferences")
        .insert({ user_id: a.id, preference_key: "welcome_video_suppressed" });
      assert(error, "B escribió una preferencia a nombre de A");
    });

    await check("B3. Ni cambiar la de A por la puerta canónica", async () => {
      // `set_user_preference` no acepta un identificador de persona: lo pone el
      // servidor. Así que ni siquiera hay forma de pedirlo.
      const { error } = await b.cli.rpc("set_user_preference",
        { p_key: "welcome_video_suppressed", p_value: "de B para A" });
      assert(!error, `B no pudo guardar la SUYA: ${error?.message}`);
      // Y lo que escribió es suyo, no de A.
      const { data } = await admin.from("user_preferences")
        .select("user_id, value").eq("user_id", b.id);
      assert((data ?? []).length === 1, "la fila de B no se creó");
      const { data: deA } = await admin.from("user_preferences")
        .select("value").eq("user_id", a.id).single();
      assert(deA!.value === null, `la preferencia de A cambió a «${deA!.value}»`);
    });

    await check("B4. Y B tampoco puede mover una fila de A a su nombre", async () => {
      const { data } = await b.cli.from("user_preferences")
        .update({ user_id: b.id }).eq("user_id", a.id).select("user_id");
      assert((data ?? []).length === 0, "B se apropió de la fila de A");
    });

    // =====================================================================
    console.log("\nC · Un superadministrador no es una excepción");
    // =====================================================================

    await check("C1. El superadministrador NO lee la preferencia de A", async () => {
      const { data } = await jefe.cli.from("user_preferences")
        .select("user_id").eq("user_id", a.id);
      assert((data ?? []).length === 0,
        `el superadministrador lee ${(data ?? []).length} filas ajenas`);
    });

    await check("C2. Ni la puede borrar para volver a enseñarle el vídeo", async () => {
      const { data } = await jefe.cli.from("user_preferences")
        .delete().eq("user_id", a.id).select("user_id");
      assert((data ?? []).length === 0, "el superadministrador reinició la preferencia de A");
      const { data: sigue } = await admin.from("user_preferences")
        .select("user_id").eq("user_id", a.id);
      assert((sigue ?? []).length === 1, "la preferencia de A desapareció");
    });

    await check("C3. Y nadie puede borrar ni la suya: no hay política de DELETE", async () => {
      const { data } = await a.cli.from("user_preferences")
        .delete().eq("user_id", a.id).select("user_id");
      assert((data ?? []).length === 0, "se pudo borrar la propia preferencia");
      const { data: sigue } = await admin.from("user_preferences")
        .select("user_id").eq("user_id", a.id);
      assert((sigue ?? []).length === 1, "la preferencia se borró");
    });

    // =====================================================================
    console.log("\nD · Un anónimo no toca nada");
    // =====================================================================

    await check("D1. Sin sesión no se lee", async () => {
      const anonimo = createClient(URL!, ANON!,
        { auth: { autoRefreshToken: false, persistSession: false } });
      const { data } = await anonimo.from("user_preferences").select("preference_key");
      assert((data ?? []).length === 0, "un anónimo lee preferencias");
    });

    await check("D2. Ni se escribe · ni por la tabla ni por la función", async () => {
      const anonimo = createClient(URL!, ANON!,
        { auth: { autoRefreshToken: false, persistSession: false } });
      const { error: eT } = await anonimo.from("user_preferences")
        .insert({ user_id: a.id, preference_key: "welcome_video_suppressed" });
      assert(eT, "un anónimo escribió en la tabla");
      const { error: eF } = await anonimo.rpc("set_user_preference",
        { p_key: "welcome_video_suppressed", p_value: null });
      assert(eF, "un anónimo llamó a la función");
    });

    // =====================================================================
    console.log("\nE · El vocabulario es cerrado");
    // =====================================================================

    await check("E1. Una preferencia inventada se rechaza en la base", async () => {
      const { error } = await a.cli.rpc("set_user_preference",
        { p_key: "welcome_video_supressed", p_value: null });   // con una sola «p»
      assert(error, "se guardó una preferencia con la clave mal escrita");
    });

    await check("E2. Y la de la bienvenida es la que el producto usa", async () => {
      const { data } = await admin.from("user_preferences")
        .select("preference_key").eq("user_id", a.id).single();
      assert(data!.preference_key === "welcome_video_suppressed",
        `la clave guardada es «${data!.preference_key}»`);
    });

    // =====================================================================
    console.log("\nF · Publicar otra versión no reinicia nada");
    // =====================================================================

    await check("F1. La fila no conoce ninguna versión de vídeo", async () => {
      const { data } = await admin.from("user_preferences")
        .select("*").eq("user_id", a.id).single();
      const columnas = Object.keys(data as Record<string, unknown>);
      for (const prohibida of ["version_id", "tutorial_id", "organization_id"]) {
        assert(!columnas.includes(prohibida),
          `la preferencia tiene la columna «${prohibida}»`);
      }
      assert(columnas.sort().join(",") === "preference_key,set_at,updated_at,user_id,value",
        `las columnas son: ${columnas.join(", ")}`);
    });
  } finally {
    // Se limpia con service_role: la propia RLS no deja borrar, que es el
    // punto de C3.
    for (const p of [a, b, jefe]) {
      await admin.from("user_preferences").delete().eq("user_id", p.id);
      await admin.from("platform_staff").delete().eq("user_id", p.id);
      await admin.auth.admin.deleteUser(p.id);
    }
  }

  console.log(`\nPE-03B4 · preferencias: ${passed} en verde, ${failed} en rojo\n`);
  process.exit(failed === 0 ? 0 : 1);
}

void main();
