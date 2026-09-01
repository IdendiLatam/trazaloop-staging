/**
 * Trazaloop · PE-04B1 · El catálogo canónico, contra la base real.
 *
 * Lo que se comprueba aquí no se puede razonar: que una revisión publicada
 * AGUANTE un intento de cambiarla, que los bytes sembrados sean exactamente los
 * del catálogo de hoy, y que quien no debe escribir no pueda.
 *
 * Correr: npm run test:pe04b1-catalog
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
const anonimo = createClient(URL, ANON,
  { auth: { autoRefreshToken: false, persistSession: false } });
const sello = `${Date.now()}`;
const password = "Trazaloop-Test-1234";

async function persona(prefijo: string, papel?: "superadmin" | "support") {
  const email = `${prefijo}-${sello}-${Math.floor(Math.random() * 1e6)}@test.trazaloop.dev`;
  const { data } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: "QA B1" } });
  assert(data.user, `crear ${prefijo}`);
  const cli: SupabaseClient = createClient(URL!, ANON!,
    { auth: { autoRefreshToken: false, persistSession: false } });
  await cli.auth.signInWithPassword({ email, password });
  if (papel) {
    await admin.from("platform_staff")
      .insert({ user_id: data.user.id, role_code: papel, status: "active" });
  }
  return { id: data.user.id, email, cli };
}

const personasCreadas: string[] = [];
async function retirarPersonasDeQa() {
  for (const id of personasCreadas) {
    await admin.from("platform_staff").delete().eq("user_id", id);
    await admin.auth.admin.deleteUser(id);
  }
}

async function main() {
  const sa = await persona("b1c-sa", "superadmin");
  const soporte = await persona("b1c-sop", "support");
  const normal = await persona("b1c-nor");
  personasCreadas.push(sa.id, soporte.id, normal.id);

  console.log("\nPE-04B1 · El catálogo canónico\n");
  const borradores: string[] = [];

  try {
    // =====================================================================
    console.log("A · La identidad");
    // =====================================================================

    await check("A1. Exactamente tres planes: free, full y extra", async () => {
      const { data } = await admin.from("plans").select("code").order("code");
      const codigos = (data ?? []).map((p) => p.code).sort();
      assert(JSON.stringify(codigos) === JSON.stringify(["extra", "free", "full"]),
        `los planes son: ${codigos.join(", ")}`);
    });

    await check("A2. NO existe un plan canónico «demo»", async () => {
      // Era cuatro cosas a la vez: ventana de prueba, suelo, fila de catálogo y
      // estado de bloqueo. Aquí la prueba es una concesión y el suelo es free.
      const { data } = await admin.from("plans").select("code").eq("code", "demo");
      assert((data ?? []).length === 0, "se sembró «demo» como plan canónico");
      const { error } = await sa.cli.from("plans")
        .insert({ code: "demo", display_order: 99 });
      assert(error, "la base admite crear un plan «demo»");
    });

    await check("A3. Ni «advisor»: es un servicio, no un plan", async () => {
      const { error } = await sa.cli.from("plans")
        .insert({ code: "advisor", display_order: 99 });
      assert(error, "la base admite crear un plan «advisor»");
    });

    await check("A4. La identidad no lleva precio ni cuota", async () => {
      const { data } = await admin.from("plans").select("*").limit(1).single();
      const columnas = Object.keys(data as Record<string, unknown>);
      for (const prohibida of ["price", "monthly_price_minor", "storage_limit_bytes",
        "display_name", "description"]) {
        assert(!columnas.includes(prohibida),
          `la identidad lleva «${prohibida}», que cambia y por tanto va en la revisión`);
      }
    });

    // =====================================================================
    console.log("\nB · Los valores sembrados, COPIADOS del catálogo de hoy");
    // =====================================================================

    await check("B1. El almacenamiento de free = el del «demo» legacy, byte a byte", async () => {
      const { data: legacy } = await admin.from("plan_definitions")
        .select("storage_limit_bytes").eq("code", "demo").single();
      const { data: nueva } = await admin.from("v_public_plan_limits")
        .select("limit_state, limit_value")
        .eq("plan_code", "free").eq("resource_code", "storage_bytes").single();
      assert(nueva!.limit_state === "finite", `free declara «${nueva!.limit_state}»`);
      assert(Number(nueva!.limit_value) === Number(legacy!.storage_limit_bytes),
        `free tiene ${nueva!.limit_value} y demo legacy ${legacy!.storage_limit_bytes}`);
    });

    await check("B2. Y los de full y extra, los suyos", async () => {
      for (const code of ["full", "extra"]) {
        const { data: legacy } = await admin.from("plan_definitions")
          .select("storage_limit_bytes").eq("code", code).single();
        const { data: nueva } = await admin.from("v_public_plan_limits")
          .select("limit_value").eq("plan_code", code)
          .eq("resource_code", "storage_bytes").single();
        assert(Number(nueva!.limit_value) === Number(legacy!.storage_limit_bytes),
          `${code}: ${nueva!.limit_value} frente a ${legacy!.storage_limit_bytes}`);
      }
    });

    await check("B3. Los límites de conteo también se copiaron, sin perder ninguno", async () => {
      const mapa: Record<string, string> = { free: "demo", full: "full", extra: "extra" };
      for (const [nuevo, legacy] of Object.entries(mapa)) {
        const { data: viejos } = await admin.from("plan_limits")
          .select("resource_code, limit_value, is_unlimited").eq("plan_code", legacy);
        for (const v of viejos ?? []) {
          const { data: n } = await admin.from("v_public_plan_limits")
            .select("limit_state, limit_value").eq("plan_code", nuevo)
            .eq("resource_code", v.resource_code).maybeSingle();
          assert(n, `${nuevo} perdió el recurso «${v.resource_code}»`);
          if (v.is_unlimited) {
            assert(n!.limit_state === "unlimited",
              `${nuevo}/${v.resource_code} era ilimitado y ahora es «${n!.limit_state}»`);
          } else {
            assert(n!.limit_state === "finite"
              && Number(n!.limit_value) === Number(v.limit_value),
              `${nuevo}/${v.resource_code}: ${n!.limit_value} frente a ${v.limit_value}`);
          }
        }
      }
    });

    await check("B4. UN solo sitio para la cuota · sin columna en la revisión", async () => {
      // Hoy el almacenamiento vive dos veces: plan_definitions.storage_limit_bytes
      // y plan_limits('storage_bytes'). Ese defecto no se repite.
      const { data } = await admin.from("plan_revisions").select("*").limit(1).single();
      const columnas = Object.keys(data as Record<string, unknown>);
      assert(!columnas.some((c) => /storage|limit|quota/.test(c)),
        `la revisión lleva una columna de cuota: ${columnas.filter((c) => /storage|limit|quota/.test(c)).join(", ")}`);
    });

    // =====================================================================
    console.log("\nC · Los precios");
    // =====================================================================

    await check("C1. Full: 4000 y 40000, en unidades menores y en USD", async () => {
      const { data } = await admin.from("v_public_plan_catalog")
        .select("price_state, currency, monthly_price_minor, annual_price_minor")
        .eq("plan_code", "full").single();
      assert(data!.price_state === "configured", `full está «${data!.price_state}»`);
      assert(data!.currency === "USD", `la moneda es «${data!.currency}»`);
      assert(Number(data!.monthly_price_minor) === 4000, `mensual: ${data!.monthly_price_minor}`);
      assert(Number(data!.annual_price_minor) === 40000, `anual: ${data!.annual_price_minor}`);
      // El anual equivale a dos meses gratis: 10 × 4000, no 12 × 4000.
      assert(Number(data!.annual_price_minor) === 10 * Number(data!.monthly_price_minor),
        "el anual dejó de equivaler a diez meses");
    });

    await check("C2. Free: cero, y CONFIGURADO · gratis es un precio", async () => {
      const { data } = await admin.from("v_public_plan_catalog")
        .select("price_state, monthly_price_minor").eq("plan_code", "free").single();
      assert(data!.price_state === "configured",
        "free está sin configurar, y gratis SÍ es una decisión tomada");
      assert(Number(data!.monthly_price_minor) === 0, `free cuesta ${data!.monthly_price_minor}`);
    });

    await check("C3. Extra: SIN CONFIGURAR, que no es lo mismo que gratis", async () => {
      const { data } = await admin.from("v_public_plan_catalog")
        .select("price_state, currency, monthly_price_minor").eq("plan_code", "extra").single();
      assert(data!.price_state === "not_configured", `extra está «${data!.price_state}»`);
      assert(data!.monthly_price_minor === null, "se inventó un precio para extra");
      assert(data!.currency === null, "extra tiene moneda sin tener precio");
    });

    await check("C4. La base no admite media promesa de precio", async () => {
      // Configurado sin moneda, o sin configurar con importe: las dos se
      // rechazan. Un precio a medias es peor que ninguno.
      const { error: e1 } = await sa.cli.from("plan_revisions").insert({
        plan_code: "free", revision_number: 900, display_name: "X",
        price_state: "configured", monthly_price_minor: 100 });
      assert(e1, "se aceptó un precio configurado sin moneda");
      const { error: e2 } = await sa.cli.from("plan_revisions").insert({
        plan_code: "free", revision_number: 901, display_name: "X",
        price_state: "not_configured", monthly_price_minor: 100, currency: "USD" });
      assert(e2, "se aceptó un importe con el precio sin configurar");
    });

    // =====================================================================
    console.log("\nD · Una revisión publicada es inmutable");
    // =====================================================================

    await check("D1. No se le puede cambiar el precio", async () => {
      const { data: rev } = await admin.from("plan_revisions")
        .select("id, monthly_price_minor").eq("plan_code", "full")
        .eq("status", "published").single();
      const { error } = await sa.cli.from("plan_revisions")
        .update({ monthly_price_minor: 9999 }).eq("id", rev!.id);
      assert(error, "se cambió el precio de una revisión publicada");
      const { data: despues } = await admin.from("plan_revisions")
        .select("monthly_price_minor").eq("id", rev!.id).single();
      assert(Number(despues!.monthly_price_minor) === Number(rev!.monthly_price_minor),
        "el precio cambió pese al rechazo");
    });

    await check("D2. Ni el nombre, ni la fecha de publicación", async () => {
      const { data: rev } = await admin.from("plan_revisions")
        .select("id").eq("plan_code", "full").eq("status", "published").single();
      for (const campo of ["display_name", "description", "effective_from", "published_at"]) {
        const valor = campo.includes("_at") || campo === "effective_from"
          ? new Date().toISOString() : "Falsificado";
        const { error } = await sa.cli.from("plan_revisions")
          .update({ [campo]: valor }).eq("id", rev!.id);
        assert(error, `se cambió «${campo}» de una revisión publicada`);
      }
    });

    await check("D3. Ni se puede borrar", async () => {
      const { data: rev } = await admin.from("plan_revisions")
        .select("id").eq("plan_code", "full").eq("status", "published").single();
      const { error } = await sa.cli.from("plan_revisions").delete().eq("id", rev!.id);
      assert(error, "se borró una revisión publicada");
    });

    await check("D4. Ni cambiarle los límites por detrás", async () => {
      // Si los límites de una publicada se pudieran tocar, su inmutabilidad no
      // serviría de nada: el precio seguiría igual y la promesa sería otra.
      const { data: rev } = await admin.from("plan_revisions")
        .select("id").eq("plan_code", "full").eq("status", "published").single();
      const { error: eU } = await sa.cli.from("plan_revision_limits")
        .update({ limit_value: 1 })
        .eq("plan_revision_id", rev!.id).eq("resource_code", "storage_bytes");
      assert(eU, "se cambió un límite de una revisión publicada");
      const { error: eD } = await sa.cli.from("plan_revision_limits")
        .delete().eq("plan_revision_id", rev!.id).eq("resource_code", "storage_bytes");
      assert(eD, "se borró un límite de una revisión publicada");
    });

    await check("D5. Un BORRADOR sí se edita · para eso es un borrador", async () => {
      const { data, error } = await sa.cli.from("plan_revisions").insert({
        plan_code: "free", revision_number: 800, status: "draft",
        display_name: `Borrador ${sello}`, price_state: "not_configured",
      }).select("id").single();
      assert(!error && data, `no se pudo crear el borrador: ${error?.message}`);
      borradores.push((data as { id: string }).id);
      const { error: eU } = await sa.cli.from("plan_revisions")
        .update({ display_name: "Borrador corregido" }).eq("id", (data as { id: string }).id);
      assert(!eU, `no se pudo editar un borrador: ${eU?.message}`);
      const { error: eL } = await sa.cli.from("plan_revision_limits").insert({
        plan_revision_id: (data as { id: string }).id,
        resource_code: "storage_bytes", limit_state: "finite", limit_value: 123 });
      assert(!eL, `no se pudieron poner límites a un borrador: ${eL?.message}`);
    });

    // =====================================================================
    console.log("\nE · Una sola revisión vigente por plan");
    // =====================================================================

    await check("E1. La base impide dos vigentes a la vez", async () => {
      const { error } = await sa.cli.from("plan_revisions").insert({
        plan_code: "full", revision_number: 700, status: "published",
        display_name: "Segunda vigente", price_state: "not_configured",
        effective_from: new Date().toISOString(), published_at: new Date().toISOString(),
      });
      assert(error, "se pudo publicar una segunda revisión vigente de full");
    });

    await check("E2. Publicar cierra la anterior y conserva su precio", async () => {
      // La revisión nueva COPIA los límites de la vigente, y el número sale de
      // contar las que hay.
      //
      // No es un detalle de limpieza: una revisión publicada NO SE PUEDE BORRAR
      // ni devolver a vigencia —el disparador lo impide, y ese es justamente el
      // invariante que D3 comprueba—, así que esta prueba no puede deshacer lo
      // que hace. Si publicara límites distintos, dejaría el catálogo cambiado
      // para todo lo que corra después. La primera versión ponía 99 bytes de
      // cuota y rompió la suite del resolutor.
      //
      // Publicando una copia, la historia crece —que es lo correcto— y el
      // estado efectivo no cambia.
      const { data: antes } = await admin.from("plan_revisions")
        .select("id, monthly_price_minor, effective_from, revision_number")
        .eq("plan_code", "free").eq("status", "published").is("effective_to", null).single();
      const { data: limitesActuales } = await admin.from("plan_revision_limits")
        .select("resource_code, limit_state, limit_value")
        .eq("plan_revision_id", antes!.id);

      const { data: nueva } = await sa.cli.from("plan_revisions").insert({
        plan_code: "free", revision_number: Number(antes!.revision_number) + 1, status: "draft",
        display_name: "Free", price_state: "configured",
        currency: "USD", monthly_price_minor: 0, annual_price_minor: 0,
      }).select("id").single();
      const nuevaId = (nueva as { id: string }).id;
      await sa.cli.from("plan_revision_limits").insert(
        (limitesActuales ?? []).map((l) => ({ ...l, plan_revision_id: nuevaId })));

      const { error } = await sa.cli.rpc("plan_publish_revision", { p_revision_id: nuevaId });
      assert(!error, `publicar falló: ${error?.message}`);

      const { data: vieja } = await admin.from("plan_revisions")
        .select("status, effective_to, monthly_price_minor").eq("id", antes!.id).single();
      assert(vieja!.status === "retired", `la anterior quedó en «${vieja!.status}»`);
      assert(vieja!.effective_to !== null, "la anterior quedó con el periodo abierto");
      assert(Number(vieja!.monthly_price_minor) === Number(antes!.monthly_price_minor),
        "publicar cambió el precio de la revisión anterior");

      const { data: vigentes } = await admin.from("plan_revisions")
        .select("id").eq("plan_code", "free").eq("status", "published").is("effective_to", null);
      assert((vigentes ?? []).length === 1, `hay ${(vigentes ?? []).length} vigentes de free`);

      // Y la cuota efectiva de free NO cambió: la historia creció, el estado no.
      const { data: cuota } = await admin.from("v_public_plan_limits")
        .select("limit_value").eq("plan_code", "free")
        .eq("resource_code", "storage_bytes").single();
      const { data: legacy } = await admin.from("plan_definitions")
        .select("storage_limit_bytes").eq("code", "demo").single();
      assert(Number(cuota!.limit_value) === Number(legacy!.storage_limit_bytes),
        `publicar cambió la cuota efectiva de free a ${cuota!.limit_value}`);
    });

    await check("E3. Una revisión sin almacenamiento no se publica", async () => {
      const { data: nueva } = await sa.cli.from("plan_revisions").insert({
        plan_code: "extra", revision_number: 600, status: "draft",
        display_name: "Sin cuota", price_state: "not_configured",
      }).select("id").single();
      borradores.push((nueva as { id: string }).id);
      const { error } = await sa.cli.rpc("plan_publish_revision",
        { p_revision_id: (nueva as { id: string }).id });
      assert(error, "se publicó una revisión que no dice cuánto almacenamiento incluye");
    });

    // =====================================================================
    console.log("\nF · Los límites: tres estados, y el tercero no concede");
    // =====================================================================

    await check("F1. La IA nace SIN CONFIGURAR, no ilimitada", async () => {
      for (const code of ["free", "full", "extra"]) {
        const { data: rev } = await admin.from("plan_revisions")
          .select("id").eq("plan_code", code).eq("status", "published").single();
        const { data: lim } = await admin.rpc("plan_limit_for_revision", {
          p_plan_revision_id: rev!.id, p_resource_code: "ai_runs_per_month" });
        const r = lim as { status: string };
        assert(r.status === "not_configured",
          `la IA de ${code} está «${r.status}» y debía estar sin configurar`);
      }
    });

    await check("F2. Un recurso que la revisión NO declara sale not_configured", async () => {
      const { data: rev } = await admin.from("plan_revisions")
        .select("id").eq("plan_code", "full").eq("status", "published").single();
      const { data: lim } = await admin.rpc("plan_limit_for_revision", {
        p_plan_revision_id: rev!.id, p_resource_code: "daily_metered_operations" });
      assert((lim as { status: string }).status === "not_configured",
        "un recurso no declarado salió como algo distinto de not_configured");
    });

    await check("F3. La base no admite un estado incoherente", async () => {
      const borrador = borradores[0];
      assert(borrador, "no hay borrador con el que probar");
      const { error: e1 } = await sa.cli.from("plan_revision_limits").insert({
        plan_revision_id: borrador, resource_code: "suppliers",
        limit_state: "finite", limit_value: null });
      assert(e1, "se aceptó «finite» sin valor");
      const { error: e2 } = await sa.cli.from("plan_revision_limits").insert({
        plan_revision_id: borrador, resource_code: "materials",
        limit_state: "unlimited", limit_value: 10 });
      assert(e2, "se aceptó «unlimited» con valor");
    });

    await check("F4. Y el vocabulario de recursos es cerrado", async () => {
      const borrador = borradores[0];
      const { error } = await sa.cli.from("plan_revision_limits").insert({
        plan_revision_id: borrador, resource_code: "recurso_inventado",
        limit_state: "finite", limit_value: 1 });
      assert(error, "se guardó un recurso que no está en el catálogo");
    });

    // =====================================================================
    console.log("\nG · Quién escribe y quién no");
    // =====================================================================

    await check("G1. Soporte NO escribe el catálogo", async () => {
      const { error: e1 } = await soporte.cli.from("plan_revisions").insert({
        plan_code: "free", revision_number: 500, display_name: "De soporte",
        price_state: "not_configured" });
      assert(e1, "soporte creó una revisión");
      const { data: rev } = await admin.from("plan_revisions")
        .select("id").eq("plan_code", "full").eq("status", "published").single();
      const { error: e2 } = await soporte.cli.rpc("plan_publish_revision",
        { p_revision_id: rev!.id });
      assert(e2, "soporte publicó una revisión");
    });

    await check("G2. Ni un usuario de empresa", async () => {
      const { error } = await normal.cli.from("plan_revisions").insert({
        plan_code: "free", revision_number: 501, display_name: "De un cliente",
        price_state: "not_configured" });
      assert(error, "un usuario normal creó una revisión");
      const { data } = await normal.cli.from("organization_plan_assignments")
        .insert({ organization_id: "00000000-0000-0000-0000-000000000000",
                  plan_revision_id: "00000000-0000-0000-0000-000000000000",
                  scope: "organization", grant_kind: "sold", source: "manual" })
        .select("id");
      assert((data ?? []).length === 0, "un usuario normal se asignó un plan");
    });

    await check("G3. Pero soporte SÍ lee, y el cliente ve lo publicado", async () => {
      const { data: s } = await soporte.cli.from("plan_revisions").select("id");
      assert((s ?? []).length > 0, "soporte no lee el catálogo");
      const { data: n } = await normal.cli.from("v_public_plan_catalog").select("plan_code");
      assert((n ?? []).length === 3, `un cliente ve ${(n ?? []).length} planes publicados`);
    });

    await check("G4. Un borrador NO lo ve un cliente", async () => {
      const { data } = await normal.cli.from("plan_revisions")
        .select("id, status").eq("status", "draft");
      assert((data ?? []).length === 0, `un cliente ve ${(data ?? []).length} borradores`);
    });

    await check("G5. Y sin sesión no se ve nada", async () => {
      const { data: c } = await anonimo.from("v_public_plan_catalog").select("plan_code");
      assert((c ?? []).length === 0, "un anónimo lee el catálogo");
      const { data: p } = await anonimo.from("plans").select("code");
      assert((p ?? []).length === 0, "un anónimo lee los planes");
    });

    // =====================================================================
    console.log("\nH · Público e interno");
    // =====================================================================

    await check("H1. Las notas internas NO salen por la vista pública", async () => {
      const { data } = await admin.from("v_public_plan_catalog").select("*").limit(1).single();
      const columnas = Object.keys(data as Record<string, unknown>);
      for (const prohibida of ["internal_notes", "created_by", "published_by", "status"]) {
        assert(!columnas.includes(prohibida),
          `la vista pública expone «${prohibida}»`);
      }
    });

    await check("H2. Ni los borradores ni las revisiones retiradas", async () => {
      const { data } = await admin.from("v_public_plan_catalog").select("plan_revision_id");
      const ids = new Set((data ?? []).map((r) => r.plan_revision_id));
      const { data: otras } = await admin.from("plan_revisions")
        .select("id, status").neq("status", "published");
      for (const o of otras ?? []) {
        assert(!ids.has(o.id), `la vista pública muestra una revisión «${o.status}»`);
      }
    });

    // =====================================================================
    console.log("\nI · La política de prueba, como configuración");
    // =====================================================================

    await check("I1. Está sembrada con lo que hace hoy el producto", async () => {
      const { data } = await admin.from("commercial_trial_policy")
        .select("enabled, trial_plan_code, trial_duration_hours").single();
      assert(data!.trial_plan_code === "full", `la prueba concede «${data!.trial_plan_code}»`);
      assert(Number(data!.trial_duration_hours) === 48,
        `la prueba dura ${data!.trial_duration_hours} horas`);
    });

    await check("I2. Es una fila única · no puede haber dos políticas", async () => {
      const { error } = await sa.cli.from("commercial_trial_policy")
        .insert({ id: true, trial_plan_code: "full", trial_duration_hours: 24 });
      assert(error, "se creó una segunda política de prueba");
    });

    await check("I3. Y el superadministrador puede cambiarla sin migración", async () => {
      const { error } = await sa.cli.from("commercial_trial_policy")
        .update({ trial_duration_hours: 72 }).eq("id", true);
      assert(!error, `no se pudo cambiar la duración: ${error?.message}`);
      await sa.cli.from("commercial_trial_policy")
        .update({ trial_duration_hours: 48 }).eq("id", true);
    });
  } finally {
    // Los borradores se van; lo publicado se queda, que para eso es historia.
    for (const id of borradores) {
      await admin.from("plan_revision_limits").delete().eq("plan_revision_id", id);
      await admin.from("plan_revisions").delete().eq("id", id).eq("status", "draft");
    }
    // La revisión que E2 publicó NO se deshace: una revisión publicada es
    // historia y el propio producto impide borrarla. Por eso E2 publica una
    // COPIA de la vigente — la historia crece y el estado efectivo no cambia.
    await retirarPersonasDeQa();
  }

  console.log(`\nPE-04B1 · catálogo: ${passed} en verde, ${failed} en rojo\n`);
  process.exit(failed === 0 ? 0 : 1);
}

void main();
